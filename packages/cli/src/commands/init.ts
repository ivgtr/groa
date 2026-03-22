import { Command } from "commander";
import select from "@inquirer/select";
import { writeFile, access } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { createDefaultConfig, BACKENDS } from "@groa/config";
import type { BackendType } from "@groa/config";

const CONFIG_FILE = "groa.json";

const BACKEND_CHOICES: { name: string; value: BackendType; description: string }[] = [
  { name: "anthropic（推奨）", value: "anthropic", description: "Anthropic Messages API を直接呼び出す。Batch API・Prompt Caching 対応" },
  { name: "openrouter", value: "openrouter", description: "OpenRouter 経由で各種モデルにアクセス" },
  { name: "claude-code", value: "claude-code", description: "Claude Code CLI をサブプロセスとして利用。APIキー不要" },
];

interface InitOptions {
  backend?: string;
  "models.haiku"?: string;
  "models.sonnet"?: string;
  "models.opus"?: string;
}

export function initCommand(): Command {
  return new Command("init")
    .description("groa.json の雛形を生成する")
    .option(
      "--backend <type>",
      "バックエンド種別 (anthropic | openrouter | claude-code)",
    )
    .option("--models.haiku <id>", "haiku ティアのモデルID")
    .option("--models.sonnet <id>", "sonnet ティアのモデルID")
    .option("--models.opus <id>", "opus ティアのモデルID")
    .action(async (options: InitOptions) => {
      if (!options.backend) {
        // 対話モード
        await runInitInteractive(process.cwd());
      } else {
        // 非対話モード
        const modelOverrides: Partial<{
          haiku: string;
          sonnet: string;
          opus: string;
        }> = {};
        if (options["models.haiku"]) modelOverrides.haiku = options["models.haiku"];
        if (options["models.sonnet"]) modelOverrides.sonnet = options["models.sonnet"];
        if (options["models.opus"]) modelOverrides.opus = options["models.opus"];
        await runInit(options.backend as BackendType, process.cwd(), modelOverrides);
      }
    });
}

export async function runInit(
  backend: BackendType = "anthropic",
  cwd = process.cwd(),
  modelOverrides: Partial<{ haiku: string; sonnet: string; opus: string }> = {},
): Promise<string> {
  const filePath = join(cwd, CONFIG_FILE);

  // 既存ファイルの確認
  let fileExists = false;
  try {
    await access(filePath);
    fileExists = true;
  } catch {
    // ファイルが存在しない場合は何もしない
  }

  if (fileExists) {
    throw new Error(
      `${CONFIG_FILE} は既に存在します。上書きする場合は手動で削除してください。`,
    );
  }

  const config = createDefaultConfig();
  config.backend = backend;

  // モデルオーバーライドの適用
  if (modelOverrides.haiku) config.models.haiku = modelOverrides.haiku;
  if (modelOverrides.sonnet) config.models.sonnet = modelOverrides.sonnet;
  if (modelOverrides.opus) config.models.opus = modelOverrides.opus;

  // APIキーは環境変数参照のプレースホルダを設定
  if (backend === "anthropic") {
    config.apiKeys.anthropic = "${ANTHROPIC_API_KEY}";
  } else if (backend === "openrouter") {
    config.apiKeys.openrouter = "${OPENROUTER_API_KEY}";
  }

  const json = JSON.stringify(config, null, 2);
  await writeFile(filePath, json + "\n", "utf-8");

  return filePath;
}

/** DI 用の対話インターフェース */
export interface InitPrompts {
  selectBackend: () => Promise<BackendType>;
  inputModel: (question: string, defaultValue: string) => Promise<string>;
}

/** 対話形式で groa.json を生成する */
export async function runInitInteractive(
  cwd = process.cwd(),
  prompts?: InitPrompts,
): Promise<string> {
  const p = prompts ?? createDefaultPrompts();

  // 1. バックエンド選択（セレクト式）
  const backend = await p.selectBackend();

  // 2. モデル設定（claude-code はティア名がデフォルト、他は空）
  const defaults = backend === "claude-code"
    ? { haiku: "haiku", sonnet: "sonnet", opus: "opus" }
    : { haiku: "", sonnet: "", opus: "" };

  console.log("\nモデルの設定（Enter でデフォルト値を使用）:");
  const haiku = await p.inputModel("  haiku ティア", defaults.haiku);
  const sonnet = await p.inputModel("  sonnet ティア", defaults.sonnet);
  const opus = await p.inputModel("  opus ティア", defaults.opus);

  // 3. runInit に委譲
  const filePath = await runInit(backend, cwd, {
    haiku: haiku || undefined,
    sonnet: sonnet || undefined,
    opus: opus || undefined,
  });

  console.log("\n✓ groa.json を生成しました");
  return filePath;
}

/** デフォルトの対話実装（実際の端末 I/O を使用） */
function createDefaultPrompts(): InitPrompts {
  return {
    selectBackend: () =>
      select<BackendType>({
        message: "バックエンド種別を選択してください",
        choices: BACKEND_CHOICES,
        default: "anthropic" as BackendType,
      }),
    inputModel: (question, defaultValue) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      const suffix = defaultValue ? ` [${defaultValue}]` : "";
      return new Promise((resolve) => {
        rl.question(`${question}${suffix}: `, (answer) => {
          rl.close();
          resolve(answer.trim() || defaultValue);
        });
      });
    },
  };
}
