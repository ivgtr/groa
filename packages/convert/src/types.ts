import type { Tweet, TweetId, Timestamp } from "@groa/types";

/**
 * 単一フィールドの値変換関数。
 * record 全体を受け取ることで、複合フィールド（hasMedia等）の導出に対応する。
 */
export type FieldTransformer<T> = (
  value: unknown,
  record: Record<string, unknown>,
) => T;

/**
 * 外部JSONのキーと変換ロジックの組み合わせ。
 * sourceKey で値を取り出し、transform で groa フィールドの型に変換する。
 */
export interface FieldMapping<T> {
  readonly sourceKey: string;
  readonly transform: FieldTransformer<T>;
}

/**
 * Tweet の全フィールドに対する変換定義。
 * 各プリセット（Twint等）はこのインターフェースを実装する。
 */
export interface ConverterDefinition {
  readonly id: FieldMapping<TweetId>;
  readonly text: FieldMapping<string>;
  readonly timestamp: FieldMapping<Timestamp>;
  readonly isRetweet: FieldMapping<boolean>;
  readonly hasMedia: FieldMapping<boolean>;
  readonly replyTo: FieldMapping<TweetId | null>;
}

/**
 * キー名のみの簡易マッピング。
 * デフォルトの変換ロジック（型強制）が適用される。
 * 省略されたフィールドには groa ネイティブのキー名がデフォルト値として使われる。
 */
export interface SimpleFieldMapping {
  readonly id?: string;
  readonly text?: string;
  readonly timestamp?: string;
  readonly isRetweet?: string;
  readonly hasMedia?: string;
  readonly replyTo?: string;
}

/** 変換結果 */
export interface ConvertResult {
  readonly tweets: Tweet[];
  readonly totalCount: number;
  readonly convertedCount: number;
  readonly skippedCount: number;
  readonly warnings: string[];
}
