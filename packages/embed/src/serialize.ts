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

/** JSON から EmbeddingIndex を復元する（number[] → Float32Array） */
export function deserializeEmbeddingIndex(data: unknown): EmbeddingIndex {
  return EmbeddingIndexSchema.parse(data);
}
