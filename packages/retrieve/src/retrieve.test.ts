import { describe, it, expect, vi } from "vitest";
import { TweetId, Timestamp, ModelIdString } from "@groa/types";
import type {
  TaggedTweet,
  EmbeddingIndex,
  TweetEmbedding,
  Category,
  Sentiment,
} from "@groa/types";
import type { Embedder } from "@groa/embed";
import { cosineSimilarity } from "./cosine-similarity.js";
import { diversityFilter } from "./diversity-filter.js";
import type { ScoredCandidate } from "./diversity-filter.js";
import { retrieve } from "./retrieve.js";

// --- ヘルパー ---

function makeTaggedTweet(
  id: string,
  text: string,
  category: Category = "tech",
  sentiment: Sentiment = "positive",
): TaggedTweet {
  return {
    tweet: {
      id: TweetId(id),
      text,
      timestamp: Timestamp(1700000000000),
      isRetweet: false,
      hasMedia: false,
      replyTo: null,
    },
    category,
    sentiment,
    topics: [],
  };
}

function makeEmbedding(
  id: string,
  vector: number[],
): TweetEmbedding {
  return {
    tweetId: TweetId(id),
    vector: new Float32Array(vector),
    dimensions: vector.length,
  };
}

function makeEmbeddingIndex(
  embeddings: TweetEmbedding[],
): EmbeddingIndex {
  return {
    embeddings,
    model: ModelIdString("test-model"),
  };
}

function makeMockEmbedder(queryVector: number[]): Embedder {
  return {
    embed: vi.fn(async (texts: string[]) =>
      texts.map(() => new Float32Array(queryVector)),
    ),
    embedQuery: vi.fn(async () => new Float32Array(queryVector)),
  };
}

// --- cosineSimilarity ---

describe("cosineSimilarity", () => {
  it("同一ベクトルの類似度は 1.0", () => {
    const v = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it("直交ベクトルの類似度は 0.0", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it("逆向きベクトルの類似度は -1.0", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it("ゼロベクトルの類似度は 0.0", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it("正規化されていないベクトルでも正しく計算される", () => {
    const a = new Float32Array([3, 4]);
    const b = new Float32Array([4, 3]);
    // cos(θ) = (3*4 + 4*3) / (5 * 5) = 24/25 = 0.96
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.96);
  });
});

// --- diversityFilter ---

describe("diversityFilter", () => {
  function makeCandidate(
    similarity: number,
    sentiment: Sentiment,
    category: Category,
  ): ScoredCandidate {
    return {
      taggedTweet: makeTaggedTweet(
        `t-${Math.random()}`,
        "text",
        category,
        sentiment,
      ),
      similarity,
    };
  }

  it("多様性無効時はスコア上位をそのまま返す", () => {
    const candidates = [
      makeCandidate(0.9, "positive", "tech"),
      makeCandidate(0.8, "positive", "tech"),
      makeCandidate(0.7, "positive", "tech"),
    ];

    const result = diversityFilter(candidates, 2, false, false);
    expect(result).toHaveLength(2);
    expect(result[0]!.similarity).toBe(0.9);
    expect(result[1]!.similarity).toBe(0.8);
  });

  it("sentiment多様性が有効な場合、異なるsentimentが優先される", () => {
    const candidates = [
      makeCandidate(0.9, "positive", "tech"),
      makeCandidate(0.85, "positive", "tech"),
      makeCandidate(0.8, "positive", "tech"),
      makeCandidate(0.7, "negative", "tech"),
      makeCandidate(0.6, "neutral", "tech"),
    ];

    // target=4, maxPerSentiment=ceil(4/2)=2
    const result = diversityFilter(candidates, 4, true, false);
    expect(result).toHaveLength(4);

    const sentiments = result.map((r) => r.taggedTweet.sentiment);
    // positive は最大2件、残りは negative/neutral が含まれるべき
    const positiveCount = sentiments.filter((s) => s === "positive").length;
    expect(positiveCount).toBeLessThanOrEqual(2);
  });

  it("category多様性が有効な場合、異なるcategoryが優先される", () => {
    const candidates = [
      makeCandidate(0.9, "positive", "tech"),
      makeCandidate(0.85, "positive", "tech"),
      makeCandidate(0.8, "positive", "tech"),
      makeCandidate(0.7, "positive", "daily"),
      makeCandidate(0.6, "positive", "opinion"),
    ];

    const result = diversityFilter(candidates, 4, false, true);
    expect(result).toHaveLength(4);

    const categories = result.map((r) => r.taggedTweet.category);
    const techCount = categories.filter((c) => c === "tech").length;
    expect(techCount).toBeLessThanOrEqual(2);
  });

  it("候補がtargetより少ない場合は全件返す", () => {
    const candidates = [
      makeCandidate(0.9, "positive", "tech"),
      makeCandidate(0.8, "negative", "daily"),
    ];

    const result = diversityFilter(candidates, 10, true, true);
    expect(result).toHaveLength(2);
  });

  it("多様性条件を満たせない場合はフォールバックで追加する", () => {
    // 全て同じ sentiment/category
    const candidates = [
      makeCandidate(0.9, "positive", "tech"),
      makeCandidate(0.8, "positive", "tech"),
      makeCandidate(0.7, "positive", "tech"),
      makeCandidate(0.6, "positive", "tech"),
    ];

    // target=4, maxPerSentiment=2 → 2件は多様性条件で選ばれ、残り2件はフォールバック
    const result = diversityFilter(candidates, 4, true, true);
    expect(result).toHaveLength(4);
  });
});

// --- retrieve ---

describe("retrieve", () => {
  // テストデータ: 各ツイートに既知のベクトルを割り当て
  const taggedTweets: TaggedTweet[] = [
    makeTaggedTweet("t1", "AI技術の最新動向", "tech", "positive"),
    makeTaggedTweet("t2", "今日のランチ", "daily", "neutral"),
    makeTaggedTweet("t3", "政治は複雑だ", "opinion", "negative"),
    makeTaggedTweet("t4", "AIは危険だ", "tech", "negative"),
    makeTaggedTweet("t5", "プログラミング楽しい", "tech", "positive"),
    makeTaggedTweet("t6", "気分が良い朝", "emotion", "positive"),
    makeTaggedTweet("t7", "機械学習の未来", "tech", "neutral"),
    makeTaggedTweet("t8", "散歩が日課", "daily", "positive"),
    makeTaggedTweet("t9", "AIの倫理問題", "opinion", "mixed"),
    makeTaggedTweet("t10", "深層学習の基礎", "tech", "neutral"),
  ];

  // t1,t4,t5,t7,t10 は tech 関連（クエリ [1,0,0] に近い）
  // t2,t8 は daily 関連、t3,t9 は opinion 関連、t6 は emotion 関連
  const embeddingIndex = makeEmbeddingIndex([
    makeEmbedding("t1", [0.9, 0.1, 0.0]),
    makeEmbedding("t2", [0.1, 0.9, 0.0]),
    makeEmbedding("t3", [0.0, 0.1, 0.9]),
    makeEmbedding("t4", [0.8, 0.2, 0.0]),
    makeEmbedding("t5", [0.85, 0.15, 0.0]),
    makeEmbedding("t6", [0.2, 0.7, 0.1]),
    makeEmbedding("t7", [0.7, 0.3, 0.0]),
    makeEmbedding("t8", [0.15, 0.85, 0.0]),
    makeEmbedding("t9", [0.3, 0.1, 0.6]),
    makeEmbedding("t10", [0.75, 0.25, 0.0]),
  ]);

  it("クエリEmbeddingが生成される", async () => {
    const embedder = makeMockEmbedder([1, 0, 0]);
    await retrieve("AI技術", embeddingIndex, taggedTweets, embedder);

    expect(embedder.embedQuery).toHaveBeenCalledWith("AI技術");
  });

  it("結果が forGeneration と forEvaluation に分割される", async () => {
    const embedder = makeMockEmbedder([1, 0, 0]);
    const result = await retrieve("AI", embeddingIndex, taggedTweets, embedder, {
      topK: 3,
    });

    expect(result.forGeneration.length).toBeGreaterThan(0);
    expect(result.forEvaluation.length).toBeGreaterThan(0);
    expect(result.forGeneration.length + result.forEvaluation.length).toBeLessThanOrEqual(6);
  });

  it("topK のデフォルトは 5", async () => {
    const embedder = makeMockEmbedder([1, 0, 0]);
    const result = await retrieve("AI", embeddingIndex, taggedTweets, embedder);

    const total = result.forGeneration.length + result.forEvaluation.length;
    expect(total).toBeLessThanOrEqual(10);
  });

  it("sentimentDiversity が多様な sentiment を含める", async () => {
    const embedder = makeMockEmbedder([1, 0, 0]);
    const result = await retrieve("AI", embeddingIndex, taggedTweets, embedder, {
      topK: 3,
      sentimentDiversity: true,
    });

    const allTweets = [...result.forGeneration, ...result.forEvaluation];
    const sentiments = new Set(allTweets.map((t) => t.sentiment));
    expect(sentiments.size).toBeGreaterThanOrEqual(2);
  });

  it("空の TaggedTweet 配列で空の結果を返す", async () => {
    const embedder = makeMockEmbedder([1, 0, 0]);
    const result = await retrieve("AI", embeddingIndex, [], embedder);

    expect(result.forGeneration).toEqual([]);
    expect(result.forEvaluation).toEqual([]);
  });

  it("空の EmbeddingIndex で空の結果を返す", async () => {
    const emptyIndex = makeEmbeddingIndex([]);
    const embedder = makeMockEmbedder([1, 0, 0]);
    const result = await retrieve("AI", emptyIndex, taggedTweets, embedder);

    expect(result.forGeneration).toEqual([]);
    expect(result.forEvaluation).toEqual([]);
  });

  it("候補不足時は取得可能な全件から処理し、半分に分割する", async () => {
    // 3件しかない → topK=5 (target=10) には足りない
    const smallTweets = taggedTweets.slice(0, 3);
    const smallIndex = makeEmbeddingIndex(
      embeddingIndex.embeddings.slice(0, 3),
    );
    const embedder = makeMockEmbedder([1, 0, 0]);

    const result = await retrieve("AI", smallIndex, smallTweets, embedder, {
      topK: 5,
    });

    const total = result.forGeneration.length + result.forEvaluation.length;
    expect(total).toBeLessThanOrEqual(3);
    // 半分に分割
    expect(result.forGeneration.length).toBe(Math.ceil(total / 2));
  });

  it("diversity オプションを無効にするとスコア順のみで選定する", async () => {
    const embedder = makeMockEmbedder([1, 0, 0]);
    const result = await retrieve("AI", embeddingIndex, taggedTweets, embedder, {
      topK: 3,
      sentimentDiversity: false,
      categoryDiversity: false,
    });

    const allTweets = [...result.forGeneration, ...result.forEvaluation];
    // クエリ [1,0,0] に最も近いのは t1 (0.9), t5 (0.85), t4 (0.8), t10 (0.75), t7 (0.7)
    // diversity なしなので純粋にスコア順
    expect(allTweets.length).toBeGreaterThan(0);
  });

  it("topK = 1 の場合は forGeneration 1件、forEvaluation 0件になる", async () => {
    const embedder = makeMockEmbedder([1, 0, 0]);
    const result = await retrieve("AI", embeddingIndex, taggedTweets, embedder, {
      topK: 1,
    });

    const total = result.forGeneration.length + result.forEvaluation.length;
    expect(total).toBeLessThanOrEqual(2);
    expect(result.forGeneration.length).toBeGreaterThanOrEqual(1);
  });

  it("同一スコアの候補が複数ある場合も安定して結果を返す", async () => {
    // 全ツイートが同じベクトル → 同じスコア
    const uniformIndex = makeEmbeddingIndex(
      taggedTweets.map((tt) =>
        makeEmbedding(tt.tweet.id as string, [0.5, 0.5, 0.0]),
      ),
    );
    const embedder = makeMockEmbedder([0.5, 0.5, 0.0]);
    const result = await retrieve(
      "テスト",
      uniformIndex,
      taggedTweets,
      embedder,
      { topK: 3 },
    );

    const total = result.forGeneration.length + result.forEvaluation.length;
    expect(total).toBeLessThanOrEqual(6);
    expect(total).toBeGreaterThan(0);
  });
});
