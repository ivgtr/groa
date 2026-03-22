import type { Tweet } from "@groa/types";

/**
 * ツイートを除外するか判定するフィルタ関数。
 * true を返したツイートは除外される。
 */
export type TweetFilter = (tweet: Tweet) => boolean;

/** リツイートを除外 */
export const isRetweet: TweetFilter = (t) => t.isRetweet;

/**
 * テキストがURLプレースホルダのみで構成されるツイートを除外。
 * 正規化後のテキストを前提とする（URLは [URL] に置換済み）。
 */
export const isUrlOnly: TweetFilter = (t) =>
  t.text.replace(/\[URL\]/g, "").trim() === "";

/**
 * 正規化後テキストが最小文字数未満のツイートを除外。
 * @param minLen 最小文字数（デフォルト5）
 */
export const isTooShort =
  (minLen: number): TweetFilter =>
  (t) =>
    t.text.length < minLen;

/**
 * ボイラープレートパターンに一致するツイートを除外。
 * @param patterns 正規表現パターン配列
 */
export const isBoilerplate =
  (patterns: RegExp[]): TweetFilter =>
  (t) =>
    patterns.some((p) => p.test(t.text));

/**
 * デフォルトフィルタ群を生成する。
 * 新規フィルタの追加は返却配列に追加するだけで完了する。
 */
export function createDefaultFilters(options?: {
  minTweetLength?: number;
  boilerplatePatterns?: string[];
}): TweetFilter[] {
  const minLen = options?.minTweetLength ?? 5;
  const boilerplate = (options?.boilerplatePatterns ?? []).map(
    (p) => new RegExp(p),
  );

  const filters: TweetFilter[] = [isRetweet, isUrlOnly, isTooShort(minLen)];

  if (boilerplate.length > 0) {
    filters.push(isBoilerplate(boilerplate));
  }

  return filters;
}
