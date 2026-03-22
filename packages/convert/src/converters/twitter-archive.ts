import type { ConverterDefinition, FieldTransformer } from "../types.js";
import {
  toTweetId,
  toTimestamp,
  toText,
  toNullableTweetId,
} from "../field-transformers.js";

/**
 * Twitter/X 公式アーカイブの isRetweet 判定。
 *
 * アーカイブの `retweeted` フィールドは常に false のため使用しない。
 * 代わりに full_text が "RT @" で始まるかで判定する。
 */
const twitterArchiveIsRetweet: FieldTransformer<boolean> = (
  value: unknown,
): boolean => {
  if (typeof value === "string") {
    return value.trimStart().startsWith("RT @");
  }
  return false;
};

/**
 * Twitter/X 公式アーカイブの hasMedia 判定。
 * entities.media 配列が存在し非空であるかで判定する。
 */
const twitterArchiveHasMedia: FieldTransformer<boolean> = (
  value: unknown,
): boolean => {
  if (typeof value !== "object" || value === null) return false;
  const entities = value as Record<string, unknown>;
  const media = entities.media;
  return Array.isArray(media) && media.length > 0;
};

/**
 * Twitter/X 公式データエクスポート形式のコンバータ定義。
 *
 * 外部フィールド → groa フィールド:
 * - id_str (string)                     → id (TweetId)
 * - full_text (string)                  → text (string)
 * - created_at (string)                 → timestamp (Timestamp) ※RFC 2822風
 * - full_text (string)                  → isRetweet (boolean) ※"RT @" 前置判定
 * - entities (object)                   → hasMedia (boolean) ※entities.media の有無
 * - in_reply_to_status_id_str (string?) → replyTo (TweetId | null)
 */
export const TWITTER_ARCHIVE_DEFINITION: ConverterDefinition = {
  id: {
    sourceKey: "id_str",
    transform: toTweetId,
  },
  text: {
    sourceKey: "full_text",
    transform: toText,
  },
  timestamp: {
    sourceKey: "created_at",
    transform: toTimestamp,
  },
  isRetweet: {
    sourceKey: "full_text",
    transform: twitterArchiveIsRetweet,
  },
  hasMedia: {
    sourceKey: "entities",
    transform: twitterArchiveHasMedia,
  },
  replyTo: {
    sourceKey: "in_reply_to_status_id_str",
    transform: toNullableTweetId,
  },
};
