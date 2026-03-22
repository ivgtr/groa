/**
 * テスト用フィクスチャの読み込みヘルパー。
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TweetSchema } from "@groa/types";
import type { Tweet } from "@groa/types";
import { z } from "zod/v4";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "fixtures");

/**
 * 合成ツイートデータセット（100件）を読み込む。
 * Zod スキーマでバリデーション済み。
 */
export function loadSyntheticTweets(): Tweet[] {
  const raw = readFileSync(
    join(FIXTURES_DIR, "synthetic-tweets.json"),
    "utf-8",
  );
  const data = JSON.parse(raw) as unknown;
  return z.array(TweetSchema).parse(data);
}

/**
 * 合成ツイートの一部を取得する。
 * @param count 取得する件数
 */
export function loadSyntheticTweetsSlice(count: number): Tweet[] {
  return loadSyntheticTweets().slice(0, count);
}
