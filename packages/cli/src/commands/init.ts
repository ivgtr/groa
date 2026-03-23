import { Command } from "commander";
import select from "@inquirer/select";
import { writeFile, access, mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { createDefaultConfig, BACKENDS, BACKEND_TIER_DEFAULTS } from "@groa/config";
import type { BackendType } from "@groa/config";
import { CONFIG_FILE, configFilePath } from "./config.js";

const BACKEND_CHOICES: { name: string; value: BackendType; description: string }[] = [
  { name: "anthropic（推奨）", value: "anthropic", description: "Anthropic Messages API を直接呼び出す。Batch API・Prompt Caching 対応" },
  { name: "openrouter", value: "openrouter", description: "OpenRouter 経由で各種モデルにアクセス" },
  { name: "claude-code", value: "claude-code", description: "Claude Code CLI をサブプロセスとして利用。APIキー不要" },
];

interface InitOptions {
  backend?: string;
  "models.quick"?: string;
  "models.standard"?: string;
  "models.deep"?: string;
}

export function initCommand(): Command {
  return new Command("init")
    .description("groa.config.json の雛形を生成する")
    .option(
      "--backend <type>",
      "バックエンド種別 (anthropic | openrouter | claude-code)",
    )
    .option("--models.quick <id>", "quick ティアのモデルID")
    .option("--models.standard <id>", "standard ティアのモデルID")
    .option("--models.deep <id>", "deep ティアのモデルID")
    .action(async (options: InitOptions) => {
      if (!options.backend) {
        // 対話モード
        await runInitInteractive(process.cwd());
      } else {
        // 非対話モード
        const modelOverrides: Partial<{
          quick: string;
          standard: string;
          deep: string;
        }> = {};
        if (options["models.quick"]) modelOverrides.quick = options["models.quick"];
        if (options["models.standard"]) modelOverrides.standard = options["models.standard"];
        if (options["models.deep"]) modelOverrides.deep = options["models.deep"];
        await runInit(options.backend as BackendType, process.cwd(), modelOverrides);
      }
    });
}

export async function runInit(
  backend: BackendType = "anthropic",
  cwd = process.cwd(),
  modelOverrides: Partial<{ quick: string; standard: string; deep: string }> = {},
): Promise<string> {
  const filePath = configFilePath(cwd);

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
  if (modelOverrides.quick) config.models.quick = modelOverrides.quick;
  if (modelOverrides.standard) config.models.standard = modelOverrides.standard;
  if (modelOverrides.deep) config.models.deep = modelOverrides.deep;

  // APIキーは環境変数参照のプレースホルダを設定
  if (backend === "anthropic") {
    config.apiKeys.anthropic = "${ANTHROPIC_API_KEY}";
  } else if (backend === "openrouter") {
    config.apiKeys.openrouter = "${OPENROUTER_API_KEY}";
  }

  const json = JSON.stringify(config, null, 2);
  await mkdir(join(cwd, ".groa"), { recursive: true });
  await writeFile(filePath, json + "\n", "utf-8");

  return filePath;
}

/** DI 用の対話インターフェース */
export interface InitPrompts {
  selectBackend: () => Promise<BackendType>;
  inputModel: (question: string, defaultValue: string) => Promise<string>;
}

/** 対話形式で groa.config.json を生成する */
export async function runInitInteractive(
  cwd = process.cwd(),
  prompts?: InitPrompts,
): Promise<string> {
  const p = prompts ?? createDefaultPrompts();

  // 1. バックエンド選択（セレクト式）
  const backend = await p.selectBackend();

  // 2. モデル設定（BACKEND_TIER_DEFAULTS からデフォルト値を取得）
  const tierDefaults = BACKEND_TIER_DEFAULTS[backend];
  const defaults = {
    quick: tierDefaults.quick ?? "",
    standard: tierDefaults.standard ?? "",
    deep: tierDefaults.deep ?? "",
  };

  console.log("\nモデルの設定（Enter でデフォルト値を使用）:");
  const quick = await p.inputModel("  quick ティア", defaults.quick);
  const standard = await p.inputModel("  standard ティア", defaults.standard);
  const deep = await p.inputModel("  deep ティア", defaults.deep);

  // 3. runInit に委譲
  const filePath = await runInit(backend, cwd, {
    quick: quick || undefined,
    standard: standard || undefined,
    deep: deep || undefined,
  });

  console.log("\n✓ groa.config.json を生成しました");
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
