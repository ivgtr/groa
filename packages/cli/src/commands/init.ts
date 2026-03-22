import { Command } from "commander";
import { writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { createDefaultConfig } from "@groa/config";
import type { BackendType } from "@groa/config";

const CONFIG_FILE = "groa.json";

export function initCommand(): Command {
  return new Command("init")
    .description("groa.json の雛形を生成する")
    .option(
      "--backend <type>",
      "バックエンド種別 (api | claude-code)",
      "api",
    )
    .action(async (options: { backend: string }) => {
      await runInit(options.backend as BackendType);
    });
}

export async function runInit(
  backend: BackendType = "api",
  cwd = process.cwd(),
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

  // APIキーは環境変数参照のプレースホルダを設定
  if (backend === "api") {
    config.apiKeys.anthropic = "${ANTHROPIC_API_KEY}";
  }

  const json = JSON.stringify(config, null, 2);
  await writeFile(filePath, json + "\n", "utf-8");

  return filePath;
}
