import type { Tweet } from "@groa/types";

/** ツイートテキストを正規化する関数 */
export type TextNormalizer = (text: string) => string;

/** URLを [URL] プレースホルダに置換 */
export const replaceUrls: TextNormalizer = (text) =>
  text.replace(/https?:\/\/\S+/g, "[URL]");

/** メンション（@ユーザー名）を除去 */
export const removeMentions: TextNormalizer = (text) =>
  text.replace(/@\w+/g, "");

/** 連続する空白を単一スペースに正規化し、前後の空白を除去 */
export const normalizeWhitespace: TextNormalizer = (text) =>
  text.replace(/\s+/g, " ").trim();

/** デフォルトの正規化関数チェーン（適用順序が重要） */
export const DEFAULT_NORMALIZERS: TextNormalizer[] = [
  replaceUrls,
  removeMentions,
  normalizeWhitespace,
];

/** テキストに正規化関数チェーンを適用する */
export function normalize(
  text: string,
  normalizers: TextNormalizer[] = DEFAULT_NORMALIZERS,
): string {
  return normalizers.reduce((t, fn) => fn(t), text);
}

/** ツイートのテキストを正規化した新しいTweetを返す */
export function normalizeTweet(
  tweet: Tweet,
  normalizers: TextNormalizer[] = DEFAULT_NORMALIZERS,
): Tweet {
  return { ...tweet, text: normalize(tweet.text, normalizers) };
}
