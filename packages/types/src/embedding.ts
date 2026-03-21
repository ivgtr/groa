import { z } from "zod/v4";
import { TweetIdSchema, ModelIdStringSchema } from "./brand.js";

// --- TweetEmbedding ---

// JSON永続化時は number[] として扱い、読み込み時に Float32Array に復元する
export const TweetEmbeddingSchema = z.object({
  tweetId: TweetIdSchema,
  vector: z.array(z.number()).transform((arr) => new Float32Array(arr)),
  dimensions: z.number(),
});

export type TweetEmbedding = {
  tweetId: z.infer<typeof TweetIdSchema>;
  vector: Float32Array;
  dimensions: number;
};

// --- EmbeddingIndex ---

export const EmbeddingIndexSchema = z.object({
  embeddings: z.array(TweetEmbeddingSchema),
  model: ModelIdStringSchema,
});

export type EmbeddingIndex = {
  embeddings: TweetEmbedding[];
  model: z.infer<typeof ModelIdStringSchema>;
};
