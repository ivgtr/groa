// 型定義
export type {
  FieldTransformer,
  FieldMapping,
  ConverterDefinition,
  SimpleFieldMapping,
  ConvertResult,
} from "./types.js";

// エラー
export { ConversionError } from "./errors.js";

// コア関数
export {
  convertTweets,
  buildDefinition,
  detectFormat,
} from "./convert.js";
export type { DetectFormatResult } from "./convert.js";

// フィールド変換関数（カスタム ConverterDefinition 構築用）
export {
  toTweetId,
  toTimestamp,
  toBoolean,
  toHasMedia,
  toNullableTweetId,
  toText,
} from "./field-transformers.js";

// 組み込みプリセット
export { TWINT_DEFINITION } from "./converters/twint.js";
export { TWITTER_ARCHIVE_DEFINITION } from "./converters/twitter-archive.js";

// Twitter/X エクスポート .js パーサー
export { parseTweetsJs } from "./parse-tweets-js.js";
