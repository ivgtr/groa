import { ConversionError } from "./errors.js";

/**
 * window.YTD.tweets.part0 = ... 形式のプレフィックスを検出する正規表現。
 * Twitter/X エクスポートの .js ファイルで使用される。
 */
const TWEETS_JS_PREFIX = /^window\.YTD\.tweets\.part\d+\s*=\s*/;

/**
 * Twitter/X 公式データエクスポートの .js ファイル文字列をパースする。
 *
 * 処理手順:
 * 1. `window.YTD.tweets.part0 = ` プレフィックスを除去
 * 2. JSON.parse で配列としてパース
 * 3. 各要素が `{ tweet: { ... } }` 形式の場合、tweet プロパティをアンラップ
 */
export function parseTweetsJs(text: string): unknown[] {
  const normalized = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const stripped = normalized.replace(TWEETS_JS_PREFIX, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new ConversionError(
      "*",
      undefined,
      "tweets.js のパースに失敗しました。Twitter/X 公式エクスポートの tweets.js ファイルを指定してください。",
    );
  }

  if (!Array.isArray(parsed)) {
    throw new ConversionError(
      "*",
      undefined,
      "tweets.js の内容が配列ではありません。",
    );
  }

  return parsed.map(unwrapTweetObject);
}

/**
 * Twitter/X エクスポートの `{ tweet: { ... } }` ネストをアンラップする。
 * ネストされていない要素はそのまま返す。
 */
function unwrapTweetObject(item: unknown): unknown {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return item;
  }
  const record = item as Record<string, unknown>;
  if (
    "tweet" in record &&
    typeof record.tweet === "object" &&
    record.tweet !== null
  ) {
    return record.tweet;
  }
  return item;
}
