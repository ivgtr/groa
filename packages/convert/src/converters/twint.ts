import { TweetId } from "@groa/types";
import type { ConverterDefinition, FieldTransformer } from "../types.js";
import {
  toTweetId,
  toTimestamp,
  toBoolean,
  toHasMedia,
  toText,
} from "../field-transformers.js";

/**
 * Twint 形式の hasMedia 導出。
 * photos（文字列配列）と video（数値 0/1）の複合条件で判定する。
 * sourceKey は "photos" だが、record 全体から video も参照する。
 */
const twintHasMedia: FieldTransformer<boolean> = (
  value: unknown,
  record: Record<string, unknown>,
): boolean => {
  const photosHasMedia = toHasMedia(value);
  const videoHasMedia = toHasMedia(record["video"]);
  return photosHasMedia || videoHasMedia;
};

/**
 * Twint 形式の replyTo 導出。
 *
 * reply_to 配列が非空ならリプライと判定し、conversation_id を返す。
 * id（number）と conversation_id（string）の直接比較は JavaScript の
 * Number 精度問題で不正確になるため、reply_to 配列の有無で判定する。
 */
const twintReplyTo: FieldTransformer<TweetId | null> = (
  _value: unknown,
  record: Record<string, unknown>,
): TweetId | null => {
  const replyTo = record["reply_to"];
  const conversationId = record["conversation_id"];

  // reply_to が非空配列 → リプライ
  if (Array.isArray(replyTo) && replyTo.length > 0) {
    if (typeof conversationId === "string" && conversationId.length > 0) {
      return TweetId(conversationId);
    }
  }

  return null;
};

/**
 * Twint（snscrape/twint 系スクレイパー）出力形式のコンバータ定義。
 *
 * 外部フィールド → groa フィールド:
 * - id (number)        → id (TweetId)
 * - tweet (string)     → text (string)
 * - created_at (string)→ timestamp (Timestamp)
 * - retweet (boolean)  → isRetweet (boolean)
 * - photos (string[])  → hasMedia (boolean) ※ video と複合
 * - conversation_id    → replyTo (TweetId | null) ※ id との比較で導出
 */
export const TWINT_DEFINITION: ConverterDefinition = {
  id: {
    sourceKey: "id",
    transform: toTweetId,
  },
  text: {
    sourceKey: "tweet",
    transform: toText,
  },
  timestamp: {
    sourceKey: "created_at",
    transform: toTimestamp,
  },
  isRetweet: {
    sourceKey: "retweet",
    transform: toBoolean,
  },
  hasMedia: {
    sourceKey: "photos",
    transform: twintHasMedia,
  },
  replyTo: {
    sourceKey: "conversation_id",
    transform: twintReplyTo,
  },
};
