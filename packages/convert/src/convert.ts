import type { Tweet } from "@groa/types";
import { TweetSchema } from "@groa/types";
import type {
  FieldMapping,
  ConverterDefinition,
  SimpleFieldMapping,
  ConvertResult,
} from "./types.js";
import {
  toTweetId,
  toTimestamp,
  toBoolean,
  toHasMedia,
  toNullableTweetId,
  toText,
} from "./field-transformers.js";
import { ConversionError } from "./errors.js";

/**
 * 外部JSON配列を groa の Tweet[] 形式に変換する。
 *
 * 変換に失敗したレコードはスキップし、warnings に記録する。
 * 全件スキップした場合はエラーをスローする。
 */
export function convertTweets(
  raw: unknown[],
  definition: ConverterDefinition,
): ConvertResult {
  const tweets: Tweet[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      warnings.push(`#${String(i + 1)}: オブジェクトではないためスキップ`);
      continue;
    }

    const record = item as Record<string, unknown>;

    try {
      const converted = convertSingleRecord(record, definition);

      // Zodスキーマで最終バリデーション
      const result = TweetSchema.safeParse(converted);
      if (!result.success) {
        warnings.push(
          `#${String(i + 1)}: スキーマバリデーション失敗: ${result.error.message}`,
        );
        continue;
      }

      tweets.push(result.data);
    } catch (error) {
      if (error instanceof ConversionError) {
        warnings.push(
          `#${String(i + 1)}: フィールド "${error.fieldName}" の変換失敗: ${error.message}`,
        );
      } else {
        warnings.push(
          `#${String(i + 1)}: 予期しないエラー: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (tweets.length === 0 && raw.length > 0) {
    throw new ConversionError(
      "*",
      undefined,
      `全${String(raw.length)}件の変換に失敗しました。マッピング設定を確認してください。`,
    );
  }

  return {
    tweets,
    totalCount: raw.length,
    convertedCount: tweets.length,
    skippedCount: raw.length - tweets.length,
    warnings,
  };
}

/** 単一レコードを変換する（バリデーション前の raw オブジェクト生成） */
function convertSingleRecord(
  record: Record<string, unknown>,
  definition: ConverterDefinition,
): unknown {
  return {
    id: resolveField("id", record, definition.id),
    text: resolveField("text", record, definition.text),
    timestamp: resolveField("timestamp", record, definition.timestamp),
    isRetweet: resolveField("isRetweet", record, definition.isRetweet),
    hasMedia: resolveField("hasMedia", record, definition.hasMedia),
    replyTo: resolveField("replyTo", record, definition.replyTo),
  };
}

/** フィールドマッピングに従って値を取得し、変換する */
function resolveField<T>(
  fieldName: string,
  record: Record<string, unknown>,
  mapping: FieldMapping<T>,
): T {
  const value = record[mapping.sourceKey];
  try {
    return mapping.transform(value, record);
  } catch (error) {
    if (error instanceof ConversionError) {
      throw error;
    }
    throw new ConversionError(
      fieldName,
      value,
      `フィールド "${fieldName}" (sourceKey: "${mapping.sourceKey}") の変換に失敗: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * SimpleFieldMapping からデフォルト変換ロジック付きの ConverterDefinition を構築する。
 *
 * 各フィールドにはデフォルトの変換関数が適用される:
 * - id: toTweetId（数値/文字列 → TweetId）
 * - text: toText（文字列変換）
 * - timestamp: toTimestamp（複数日時形式対応）
 * - isRetweet: toBoolean（boolean/数値/文字列対応）
 * - hasMedia: toHasMedia（配列/boolean/数値対応）
 * - replyTo: toNullableTweetId（null許容 TweetId）
 */
export function buildDefinition(mapping: SimpleFieldMapping): ConverterDefinition {
  return {
    id: {
      sourceKey: mapping.id ?? "id",
      transform: toTweetId,
    },
    text: {
      sourceKey: mapping.text ?? "text",
      transform: toText,
    },
    timestamp: {
      sourceKey: mapping.timestamp ?? "timestamp",
      transform: toTimestamp,
    },
    isRetweet: {
      sourceKey: mapping.isRetweet ?? "isRetweet",
      transform: toBoolean,
    },
    hasMedia: {
      sourceKey: mapping.hasMedia ?? "hasMedia",
      transform: toHasMedia,
    },
    replyTo: {
      sourceKey: mapping.replyTo ?? "replyTo",
      transform: toNullableTweetId,
    },
  };
}

/** 既知のフォーマットを検出するためのキーフィンガープリント */
const FORMAT_FINGERPRINTS: {
  readonly name: string;
  readonly requiredKeys: readonly string[];
}[] = [
  {
    name: "twint",
    requiredKeys: ["tweet", "created_at", "retweet", "username"],
  },
];

/** groa ネイティブ形式の必須キー */
const GROA_NATIVE_KEYS = ["id", "text", "timestamp", "isRetweet", "hasMedia", "replyTo"] as const;

/** 検出結果 */
export interface DetectFormatResult {
  /** groa ネイティブ形式かどうか */
  readonly isNativeGroa: boolean;
  /** 検出されたフォーマット名（null = 不明） */
  readonly formatName: string | null;
  /** サンプルから抽出したキー一覧 */
  readonly detectedKeys: string[];
}

/**
 * 配列の先頭要素を調べてフォーマットを自動検出する。
 *
 * 判定順序:
 * 1. TweetSchema で safeParse → 成功なら groa ネイティブ
 * 2. 既知フォーマットのキーフィンガープリント照合
 * 3. いずれにも該当しない → formatName: null
 */
export function detectFormat(data: unknown[]): DetectFormatResult {
  if (data.length === 0) {
    return { isNativeGroa: false, formatName: null, detectedKeys: [] };
  }

  const sample = data[0];
  if (typeof sample !== "object" || sample === null || Array.isArray(sample)) {
    return { isNativeGroa: false, formatName: null, detectedKeys: [] };
  }

  const record = sample as Record<string, unknown>;
  const keys = Object.keys(record);

  // groa ネイティブ形式の判定
  const hasAllGroaKeys = GROA_NATIVE_KEYS.every((k) => keys.includes(k));
  if (hasAllGroaKeys) {
    const parseResult = TweetSchema.safeParse(record);
    if (parseResult.success) {
      return { isNativeGroa: true, formatName: null, detectedKeys: keys };
    }
  }

  // 既知フォーマットの検出
  for (const fp of FORMAT_FINGERPRINTS) {
    const hasAll = fp.requiredKeys.every((k) => keys.includes(k));
    if (hasAll) {
      return { isNativeGroa: false, formatName: fp.name, detectedKeys: keys };
    }
  }

  return { isNativeGroa: false, formatName: null, detectedKeys: keys };
}
