import { Command } from "commander";
import { writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { createDefaultConfig } from "@groa/config";
import type { BackendType } from "@groa/config";

const CONFIG_FILE = "groa.json";

interface InitOptions {
  backend: string;
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
      "anthropic",
    )
    .option("--models.haiku <id>", "haiku ティアのモデルID")
    .option("--models.sonnet <id>", "sonnet ティアのモデルID")
    .option("--models.opus <id>", "opus ティアのモデルID")
    .action(async (options: InitOptions) => {
      const modelOverrides: Partial<{
        haiku: string;
        sonnet: string;
        opus: string;
      }> = {};
      if (options["models.haiku"]) modelOverrides.haiku = options["models.haiku"];
      if (options["models.sonnet"]) modelOverrides.sonnet = options["models.sonnet"];
      if (options["models.opus"]) modelOverrides.opus = options["models.opus"];
      await runInit(options.backend as BackendType, process.cwd(), modelOverrides);
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
