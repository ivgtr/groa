import type { TaggedTweet, EmbeddingIndex } from "@groa/types";
import type { Embedder } from "@groa/embed";
import { cosineSimilarity } from "./cosine-similarity.js";
import { diversityFilter } from "./diversity-filter.js";
import type { ScoredCandidate } from "./diversity-filter.js";

export interface RetrieveOptions {
  topK?: number;
  sentimentDiversity?: boolean;
  categoryDiversity?: boolean;
}

export interface RetrieveResult {
  forGeneration: TaggedTweet[];
  forEvaluation: TaggedTweet[];
}

/**
 * トピックに関連し、かつ態度の多様性を確保したツイートを検索する。
 *
 * Phase 1: Cosine similarity で上位 topK*6 件の候補を取得
 * Phase 2: sentiment/category の多様性を確保しつつ 2*topK 件を選定
 * 結果を前半（生成用）と後半（評価用）に分割して返す
 */
export async function retrieve(
  topic: string,
  embeddingIndex: EmbeddingIndex,
  taggedTweets: TaggedTweet[],
  embedder: Embedder,
  options: RetrieveOptions = {},
): Promise<RetrieveResult> {
  const {
    topK = 5,
    sentimentDiversity = true,
    categoryDiversity = true,
  } = options;

  if (taggedTweets.length === 0 || embeddingIndex.embeddings.length === 0) {
    return { forGeneration: [], forEvaluation: [] };
  }

  // Phase 1: クエリEmbedding生成 + Cosine similarity 検索
  const queryVector = await embedder.embedQuery(topic);

  // tweetId → TaggedTweet のルックアップテーブル
  const taggedMap = new Map<string, TaggedTweet>();
  for (const tt of taggedTweets) {
    taggedMap.set(tt.tweet.id as string, tt);
  }

  // 全件スキャンでスコア計算
  const scored: ScoredCandidate[] = [];
  for (const emb of embeddingIndex.embeddings) {
    const taggedTweet = taggedMap.get(emb.tweetId as string);
    if (!taggedTweet) continue;

    const similarity = cosineSimilarity(queryVector, emb.vector);
    scored.push({ taggedTweet, similarity });
  }

  // 類似度降順でソート
  scored.sort((a, b) => b.similarity - a.similarity);

  // 上位 topK*6 件の候補を取得（不足時は全件）
  const candidateCount = Math.min(topK * 6, scored.length);
  const candidates = scored.slice(0, candidateCount);

  // Phase 2: 多様性フィルタリング
  const target = 2 * topK;
  const selected = diversityFilter(
    candidates,
    target,
    sentimentDiversity,
    categoryDiversity,
  );

  // 前半（生成用）と後半（評価用）に分割
  // 候補不足時は取得件数を半分に分割
  const splitPoint = Math.ceil(selected.length / 2);

  return {
    forGeneration: selected
      .slice(0, splitPoint)
      .map((c) => c.taggedTweet),
    forEvaluation: selected
      .slice(splitPoint)
      .map((c) => c.taggedTweet),
  };
}
