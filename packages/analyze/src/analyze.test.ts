import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TaggedTweet, Category } from "@groa/types";
import { TweetId, Timestamp, ModelIdString } from "@groa/types";
import type { LlmBackend, LlmRequest, LlmResponse } from "@groa/llm-client";
import type { ClusterWithStats, ClusterStatsSubset } from "./cluster-stats.js";
import { buildAnalyzePrompt } from "./analyze-prompt.js";
import { parseAnalyzeResponse } from "./analyze-parse.js";
import { analyzeClusters, analyzeCluster } from "./analyze.js";

// --- テストヘルパー ---

let counter = 0;

function makeTaggedTweet(
  category: Category,
  text?: string,
): TaggedTweet {
  counter++;
  return {
    tweet: {
      id: TweetId(`t${counter}`),
      text: text ?? `テスト${counter}`,
      timestamp: Timestamp(Date.now() + counter),
      isRetweet: false,
      hasMedia: false,
      replyTo: null,
    },
    category,
    sentiment: "neutral",
    topics: [],
  };
}

function makeClusterWithStats(
  category: Category,
  tweetCount: number,
): ClusterWithStats {
  const tweets = Array.from({ length: tweetCount }, () =>
    makeTaggedTweet(category),
  );
  const stats: ClusterStatsSubset = {
    sentenceEndings: [
      { ending: "だ", frequency: 10, exampleTweetIds: [TweetId("t1")] },
      { ending: "です", frequency: 8, exampleTweetIds: [TweetId("t2")] },
    ],
    topTokens: [
      { token: "技術", count: 15, isNoun: true },
      { token: "使う", count: 10, isNoun: false },
    ],
  };
  return {
    cluster: { category, tweets, tweetCount: tweets.length },
    stats,
  };
}

function makeValidAnalyzeResponse(tweetIds: string[]): string {
  return JSON.stringify({
    portrait:
      "この人物は技術的な話題において、断定的な語り口を好む。" +
      "具体的には「〜だ」という語尾を多用し、結論を先に述べてから補足する傾向がある。" +
      "プログラミング言語に対する知識は深く、比較検討を楽しんでいるようだ。" +
      "一方で、初心者への説明も丁寧に行い、排他的な態度は見られない。" +
      "新しい技術に対しては積極的に試す姿勢があり、失敗談も率直に共有する。" +
      "コードの品質に対するこだわりが強く、リファクタリングの話題には特に熱が入る。",
    representativeTweets: tweetIds.slice(0, 3).map((id) => ({
      tweetId: id,
      reason: "テストの選定理由",
    })),
    attitudePatterns: [
      {
        name: "断定スタイル",
        description: "結論を先に断言してから補足する",
        exampleTweetIds: tweetIds.slice(0, 2),
      },
      {
        name: "比較好き",
        description: "複数の選択肢を並べて検討する",
        exampleTweetIds: tweetIds.slice(1, 3),
      },
      {
        name: "失敗共有",
        description: "自分の失敗を率直に語る",
        exampleTweetIds: tweetIds.slice(0, 1),
      },
    ],
  });
}

function createMockBackend(
  responseFn: (request: LlmRequest) => Partial<LlmResponse>,
): LlmBackend & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  const defaultResponse: LlmResponse = {
    content: "",
    inputTokens: 500,
    outputTokens: 300,
    modelUsed: ModelIdString("claude-sonnet-4-6-20250227"),
    cachedTokens: 0,
    costUsd: 0.01,
  };

  return {
    calls,
    backendType: () => "api" as const,
    complete: async (request: LlmRequest): Promise<LlmResponse> => {
      calls.push(request);
      const partial = responseFn(request);
      return { ...defaultResponse, ...partial };
    },
  };
}

// --- テスト ---

describe("buildAnalyzePrompt", () => {
  beforeEach(() => {
    counter = 0;
  });

  it("カテゴリ名がuserメッセージに含まれる", () => {
    const cws = makeClusterWithStats("tech", 10);
    const { user } = buildAnalyzePrompt(cws);
    expect(user).toContain("tech");
  });

  it("分析観点がuserメッセージに含まれる", () => {
    const cws = makeClusterWithStats("opinion", 10);
    const { user } = buildAnalyzePrompt(cws);
    expect(user).toContain("主張の仕方");
  });

  it("語尾パターンがuserメッセージに含まれる", () => {
    const cws = makeClusterWithStats("tech", 10);
    const { user } = buildAnalyzePrompt(cws);
    expect(user).toContain("だ");
    expect(user).toContain("です");
  });

  it("頻出表現がuserメッセージに含まれる", () => {
    const cws = makeClusterWithStats("tech", 10);
    const { user } = buildAnalyzePrompt(cws);
    expect(user).toContain("技術");
    expect(user).toContain("使う");
  });

  it("ツイートIDとテキストがuserメッセージに含まれる", () => {
    const cws = makeClusterWithStats("tech", 5);
    const { user } = buildAnalyzePrompt(cws);
    for (const tt of cws.cluster.tweets) {
      expect(user).toContain(tt.tweet.id);
    }
  });

  it("systemプロンプトにJSON出力フォーマットが含まれる", () => {
    const cws = makeClusterWithStats("tech", 5);
    const { system } = buildAnalyzePrompt(cws);
    expect(system).toContain("portrait");
    expect(system).toContain("representativeTweets");
    expect(system).toContain("attitudePatterns");
  });
});

describe("parseAnalyzeResponse", () => {
  beforeEach(() => {
    counter = 0;
    vi.restoreAllMocks();
  });

  it("正常なJSONレスポンスをClusterAnalysisにパースする", () => {
    const cws = makeClusterWithStats("tech", 10);
    const tweetIds = cws.cluster.tweets.map((tt) => tt.tweet.id as string);
    const response = makeValidAnalyzeResponse(tweetIds);

    const result = parseAnalyzeResponse(response, cws.cluster);

    expect(result).not.toBeNull();
    expect(result?.category).toBe("tech");
    expect(result?.tweetCount).toBe(10);
    expect(result?.portrait.length).toBeGreaterThan(0);
    expect(result?.representativeTweets.length).toBeLessThanOrEqual(10);
    expect(result?.attitudePatterns.length).toBeGreaterThanOrEqual(1);
  });

  it("representativeTweetsが実在するツイートのみ含む", () => {
    const cws = makeClusterWithStats("tech", 5);
    const tweetIds = cws.cluster.tweets.map((tt) => tt.tweet.id as string);
    const response = makeValidAnalyzeResponse([
      ...tweetIds,
      "nonexistent-id",
    ]);

    const result = parseAnalyzeResponse(response, cws.cluster);

    expect(result).not.toBeNull();
    for (const rt of result?.representativeTweets ?? []) {
      expect(cws.cluster.tweets.some((t) => t.tweet.id === rt.tweet.id)).toBe(
        true,
      );
    }
  });

  it("attitudePatternsのexampleTweetIdsが実在IDのみ含む", () => {
    const cws = makeClusterWithStats("tech", 5);
    const validIds = cws.cluster.tweets.map((tt) => tt.tweet.id as string);

    const response = JSON.stringify({
      portrait: "テスト用portrait",
      representativeTweets: [],
      attitudePatterns: [
        {
          name: "テスト",
          description: "テスト説明",
          exampleTweetIds: [...validIds.slice(0, 2), "fake-id"],
        },
      ],
    });

    const result = parseAnalyzeResponse(response, cws.cluster);

    expect(result).not.toBeNull();
    expect(result?.attitudePatterns[0].exampleTweetIds).toHaveLength(2);
  });

  it("attitudePatternsにsourceCategoriesが設定される", () => {
    const cws = makeClusterWithStats("emotion", 5);
    const tweetIds = cws.cluster.tweets.map((tt) => tt.tweet.id as string);
    const response = makeValidAnalyzeResponse(tweetIds);

    const result = parseAnalyzeResponse(response, cws.cluster);

    expect(result?.attitudePatterns[0].sourceCategories).toEqual(["emotion"]);
  });

  it("不正なJSONでnullを返す", () => {
    const cws = makeClusterWithStats("tech", 5);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = parseAnalyzeResponse("invalid json", cws.cluster);

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('クラスタ "tech"'),
    );
  });

  it("必須フィールド欠落でnullを返す", () => {
    const cws = makeClusterWithStats("tech", 5);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = parseAnalyzeResponse(
      JSON.stringify({ portrait: "test" }),
      cws.cluster,
    );

    expect(result).toBeNull();
  });

  it("コードブロック内のJSONをパースする", () => {
    const cws = makeClusterWithStats("tech", 5);
    const tweetIds = cws.cluster.tweets.map((tt) => tt.tweet.id as string);
    const json = makeValidAnalyzeResponse(tweetIds);
    const response = "```json\n" + json + "\n```";

    const result = parseAnalyzeResponse(response, cws.cluster);
    expect(result).not.toBeNull();
    expect(result?.category).toBe("tech");
  });
});

describe("analyzeClusters", () => {
  beforeEach(() => {
    counter = 0;
    vi.restoreAllMocks();
  });

  it("各クラスタに対してLLMを呼び出す", async () => {
    const clusters = [
      makeClusterWithStats("tech", 5),
      makeClusterWithStats("daily", 5),
    ];

    const backend = createMockBackend(() => {
      const tweetIds = clusters[0].cluster.tweets.map(
        (tt) => tt.tweet.id as string,
      );
      return { content: makeValidAnalyzeResponse(tweetIds) };
    });

    const results = await analyzeClusters(clusters, backend);

    expect(backend.calls).toHaveLength(2);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("Sonnetモデル・temperature 0.0でリクエストする", async () => {
    const clusters = [makeClusterWithStats("tech", 5)];
    const tweetIds = clusters[0].cluster.tweets.map(
      (tt) => tt.tweet.id as string,
    );

    const backend = createMockBackend(() => ({
      content: makeValidAnalyzeResponse(tweetIds),
    }));

    await analyzeClusters(clusters, backend);

    expect(backend.calls[0].model).toBe("sonnet");
    expect(backend.calls[0].options.temperature).toBe(0.0);
  });

  it("バリデーション失敗のクラスタはスキップする", async () => {
    const clusters = [
      makeClusterWithStats("tech", 5),
      makeClusterWithStats("daily", 5),
    ];

    let callIdx = 0;
    const backend = createMockBackend(() => {
      callIdx++;
      if (callIdx === 1) return { content: "invalid json" };
      const tweetIds = clusters[1].cluster.tweets.map(
        (tt) => tt.tweet.id as string,
      );
      return { content: makeValidAnalyzeResponse(tweetIds) };
    });

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const results = await analyzeClusters(clusters, backend);

    expect(backend.calls).toHaveLength(2);
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("daily");
  });

  it("進捗コールバックが呼ばれる", async () => {
    const clusters = [
      makeClusterWithStats("tech", 5),
      makeClusterWithStats("daily", 5),
    ];
    const tweetIds = clusters[0].cluster.tweets.map(
      (tt) => tt.tweet.id as string,
    );

    const backend = createMockBackend(() => ({
      content: makeValidAnalyzeResponse(tweetIds),
    }));

    const progress = vi.fn();
    await analyzeClusters(clusters, backend, { onProgress: progress });

    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith(1, 2);
    expect(progress).toHaveBeenCalledWith(2, 2);
  });
});

describe("analyzeCluster", () => {
  beforeEach(() => {
    counter = 0;
    vi.restoreAllMocks();
  });

  it("正常なレスポンスでClusterAnalysisを返す", async () => {
    const cws = makeClusterWithStats("tech", 10);
    const tweetIds = cws.cluster.tweets.map((tt) => tt.tweet.id as string);

    const backend = createMockBackend(() => ({
      content: makeValidAnalyzeResponse(tweetIds),
    }));

    const result = await analyzeCluster(cws, backend);

    expect(result).not.toBeNull();
    expect(result?.category).toBe("tech");
    expect(result?.portrait.length).toBeGreaterThan(0);
    expect(result?.representativeTweets.length).toBeGreaterThan(0);
    expect(result?.attitudePatterns.length).toBeGreaterThan(0);
  });

  it("不正なレスポンスでnullを返す", async () => {
    const cws = makeClusterWithStats("tech", 5);
    const backend = createMockBackend(() => ({ content: "not json" }));

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await analyzeCluster(cws, backend);

    expect(result).toBeNull();
  });
});
