import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GroaConfigSchema } from "@groa/config";

const CONFIG_FILE = "groa.json";

export function configCommand(): Command {
  return new Command("config")
    .description("現在の設定を表示する")
    .action(async () => {
      const config = await loadConfig();
      console.log(JSON.stringify(config, null, 2));
    });
}

export async function loadConfig(
  cwd = process.cwd(),
): Promise<ReturnType<typeof GroaConfigSchema.parse>> {
  const filePath = join(cwd, CONFIG_FILE);

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    throw new Error(
      `${CONFIG_FILE} が見つかりません。\`groa init\` で生成してください。`,
    );
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return GroaConfigSchema.parse(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `${CONFIG_FILE} のJSON形式が不正です: ${error.message}`,
      );
    }
    throw new Error(
      `${CONFIG_FILE} の設定値が不正です: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
