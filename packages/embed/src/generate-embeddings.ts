import type { TweetCorpus, EmbeddingIndex, TweetEmbedding } from "@groa/types";
import type { ModelIdString } from "@groa/types";
import type { Embedder } from "./embedder.js";
import { DEFAULT_MODEL } from "./embedder.js";

const EMBEDDING_DIMENSIONS = 384;

export interface GenerateEmbeddingsOptions {
  model?: ModelIdString;
}

/**
 * TweetCorpus の全ツイートに対して Embedding を生成し、EmbeddingIndex を返す。
 * バッチ処理は Embedder 内部で行われる（デフォルト128件ずつ）。
 */
export async function generateEmbeddings(
  corpus: TweetCorpus,
  embedder: Embedder,
  options: GenerateEmbeddingsOptions = {},
): Promise<EmbeddingIndex> {
  const { model = DEFAULT_MODEL } = options;
  const { tweets } = corpus;
  const texts = tweets.map((t) => t.text);

  const vectors = await embedder.embed(texts);

  const embeddings: TweetEmbedding[] = tweets.map((tweet, i) => ({
    tweetId: tweet.id,
    vector: vectors[i]!,
    dimensions: EMBEDDING_DIMENSIONS,
  }));

  return { embeddings, model };
}
