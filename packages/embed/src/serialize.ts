import type { EmbeddingIndex } from "@groa/types";
import { EmbeddingIndexSchema } from "@groa/types";

/** JSON永続化用のシリアライズ形式 */
export interface SerializedEmbeddingIndex {
  embeddings: Array<{
    tweetId: string;
    vector: number[];
    dimensions: number;
  }>;
  model: string;
}

/** EmbeddingIndex を JSON-safe な形式に変換する（Float32Array → number[]） */
export function serializeEmbeddingIndex(
  index: EmbeddingIndex,
): SerializedEmbeddingIndex {
  return {
    embeddings: index.embeddings.map((e) => ({
      tweetId: e.tweetId as string,
      vector: Array.from(e.vector),
      dimensions: e.dimensions,
    })),
    model: index.model as string,
  };
}

/**
 * インデックスキーのオブジェクト（{"0":0.1,"1":0.2,...}）を number[] に変換する。
 * 旧形式キャッシュとの後方互換のために必要。
 */
function normalizeVector(v: unknown): unknown {
  if (Array.isArray(v)) return v;
  if (typeof v === "object" && v !== null && "0" in v) {
    return Object.values(v as Record<string, number>);
  }
  return v;
}

/** JSON から EmbeddingIndex を復元する（number[] / 旧オブジェクト形式 → Float32Array） */
export function deserializeEmbeddingIndex(data: unknown): EmbeddingIndex {
  if (
    typeof data === "object" &&
    data !== null &&
    "embeddings" in data &&
    Array.isArray((data as Record<string, unknown>).embeddings)
  ) {
    const raw = data as { embeddings: Array<Record<string, unknown>>; [k: string]: unknown };
    raw.embeddings = raw.embeddings.map((e) => ({
      ...e,
      vector: normalizeVector(e.vector),
    }));
  }
  return EmbeddingIndexSchema.parse(data);
}
