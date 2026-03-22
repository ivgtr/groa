import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GroaConfigSchema } from "@groa/config";

const CONFIG_FILE = "groa.json";

export function configCommand(): Command {
  const cmd = new Command("config").description("設定を表示・更新する");

  cmd.addCommand(
    new Command("show")
      .description("現在の設定を表示する")
      .action(async () => {
        const config = await loadConfig();
        console.log(JSON.stringify(config, null, 2));
      }),
  );

  cmd.addCommand(
    new Command("set")
      .description("設定値を更新する")
      .argument("<key>", "設定キー (例: models.sonnet)")
      .argument("<value>", "設定値")
      .action(async (key: string, value: string) => {
        await runConfigSet(key, value);
      }),
  );

  // 後方互換: 引数なしで `groa config` を実行した場合は show と同等
  cmd.action(async () => {
    const config = await loadConfig();
    console.log(JSON.stringify(config, null, 2));
  });

  return cmd;
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

export async function runConfigSet(
  key: string,
  value: string,
  cwd = process.cwd(),
): Promise<void> {
  const filePath = join(cwd, CONFIG_FILE);

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    throw new Error(
      `${CONFIG_FILE} が見つかりません。\`groa init\` で生成してください。`,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `${CONFIG_FILE} のJSON形式が不正です: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  setNestedValue(parsed, key.split("."), value);

  // Zodバリデーション
  try {
    GroaConfigSchema.parse(parsed);
  } catch (error) {
    throw new Error(
      `設定値が不正です (${key} = ${value}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  await writeFile(filePath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
}

function setNestedValue(
  obj: Record<string, unknown>,
  keys: string[],
  value: string,
): void {
  const [head, ...rest] = keys;
  if (!head) {
    throw new Error("設定キーが不正です。空のセグメントが含まれています。");
  }

  if (rest.length === 0) {
    obj[head] = value;
    return;
  }

  if (typeof obj[head] !== "object" || obj[head] === null) {
    obj[head] = {};
  }
  setNestedValue(obj[head] as Record<string, unknown>, rest, value);
}
