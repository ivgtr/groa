import { access, readFile } from "node:fs/promises";
import { parseTweetsJs } from "@groa/convert";

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

const FETCH_TIMEOUT_MS = 30_000;

/** URL文字列かどうかを判定する */
export function isUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

/** URLからJSONを取得する。30秒タイムアウト付き */
export async function fetchJsonFromUrl(
  url: string,
  action: string,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `タイムアウト: ${url}（${String(FETCH_TIMEOUT_MS / 1000)}秒以内に応答がありませんでした）\n→ ${action}`,
      );
    }
    throw new Error(
      `URLへの接続に失敗しました: ${url}\n→ ${action}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(
      `HTTPエラー (${String(response.status)}): ${url}\n→ ${action}`,
    );
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const msg = error instanceof SyntaxError ? error.message : String(error);
    throw new Error(
      `JSON形式が不正です: ${url}\n詳細: ${msg}`,
    );
  }
}

/** Twitter/X エクスポートの .js ファイルを読み込み、パースして返す */
export async function readTweetsJsFile(
  filePath: string,
  action: string,
): Promise<unknown[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    throw new Error(
      `ファイルが見つかりません: ${filePath}\n→ ${action}`,
    );
  }

  return parseTweetsJs(raw);
}

/** ファイルパスまたはURLから自動判定してデータを読み込む。.js ファイルは tweets.js として処理する */
export async function readJsonSource(
  source: string,
  action: string,
): Promise<unknown> {
  if (isUrl(source)) {
    return fetchJsonFromUrl(source, action);
  }
  if (source.endsWith(".js")) {
    return readTweetsJsFile(source, action);
  }
  return readJsonFile(source, action);
}
