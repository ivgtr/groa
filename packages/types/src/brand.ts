import { z } from "zod/v4";

// --- Branded Type ユーティリティ ---

type Brand<T, B extends string> = T & { readonly __brand: B };

// --- Branded Types ---

export type TweetId = Brand<string, "TweetId">;
export type Timestamp = Brand<number, "Timestamp">;
export type ModelIdString = Brand<string, "ModelIdString">;

// --- ファクトリ関数 ---

export const TweetId = (s: string): TweetId => s as TweetId;
export const Timestamp = (n: number): Timestamp => n as Timestamp;
export const ModelIdString = (s: string): ModelIdString => s as ModelIdString;

// --- Zod スキーマ ---

export const TweetIdSchema = z.string().transform((s) => s as TweetId);
export const TimestampSchema = z.number().transform((n) => n as Timestamp);
export const ModelIdStringSchema = z
  .string()
  .transform((s) => s as ModelIdString);
