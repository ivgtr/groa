import { access, readFile } from "node:fs/promises";

/** ファイルの存在を確認し、存在しない場合はアクション付きエラーをスローする */
export async function assertFileExists(
  filePath: string,
  action: string,
): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new Error(
      `ファイルが見つかりません: ${filePath}\n→ ${action}`,
    );
  }
}

/** JSONファイルを読み込み、パースして返す。エラー時はアクション付きメッセージ */
export async function readJsonFile(
  filePath: string,
  action: string,
): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    throw new Error(
      `ファイルが見つかりません: ${filePath}\n→ ${action}`,
    );
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const msg = error instanceof SyntaxError ? error.message : String(error);
    throw new Error(
      `JSON形式が不正です: ${filePath}\n詳細: ${msg}`,
    );
  }
}
