import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  ClusterAnalysis,
  AttitudePattern,
  TaggedTweet,
  Category,
} from "@groa/types";
import { TweetId, Timestamp, ModelIdString } from "@groa/types";
import type { LlmBackend, LlmRequest, LlmResponse } from "@groa/llm-client";
import {
  groupAnalysesByCategory,
  mergeClusterAnalyses,
} from "./merge-clusters.js";

// --- テストヘルパー ---

let counter = 0;

function makeTaggedTweet(category: Category, text?: string): TaggedTweet {
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

function makeAttitudePattern(
  name: string,
  category: Category,
): AttitudePattern {
  return {
    name,
    description: `${name}の説明`,
    exampleTweetIds: [TweetId(`t${counter}`)],
    sourceCategories: [category],
  };
}

function makeClusterAnalysis(
  category: Category,
  tweetCount: number,
  options?: {
    portrait?: string;
    representativeCount?: number;
    patternNames?: string[];
  },
): ClusterAnalysis {
  const repCount = options?.representativeCount ?? 3;
  const representativeTweets = Array.from({ length: repCount }, () =>
    makeTaggedTweet(category),
  );
  const patternNames = options?.patternNames ?? ["パターンA", "パターンB"];
  const attitudePatterns = patternNames.map((name) =>
    makeAttitudePattern(name, category),
  );

  return {
    category,
    tweetCount,
    portrait:
      options?.portrait ?? `${category}カテゴリの人物像テスト（${tweetCount}件）`,
    representativeTweets,
    attitudePatterns,
  };
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
    backendType: () => "anthropic" as const,
    complete: async (request: LlmRequest): Promise<LlmResponse> => {
      calls.push(request);
      const partial = responseFn(request);
      return { ...defaultResponse, ...partial };
    },
  };
}

function makeMergePortraitResponse(portrait: string): string {
  return JSON.stringify({ portrait });
}

// --- テスト ---

describe("groupAnalysesByCategory", () => {
  beforeEach(() => {
    counter = 0;
  });

  it("全カテゴリ異なる場合はすべて single に入る", () => {
    const analyses = [
      makeClusterAnalysis("tech", 100),
      makeClusterAnalysis("daily", 200),
      makeClusterAnalysis("opinion", 150),
    ];

    const { single, toMerge } = groupAnalysesByCategory(analyses);

    expect(single).toHaveLength(3);
    expect(toMerge.size).toBe(0);
  });

  it("同カテゴリが2つある場合は toMerge に分類される", () => {
    const analyses = [
      makeClusterAnalysis("daily", 2000),
      makeClusterAnalysis("daily", 1500),
    ];

    const { single, toMerge } = groupAnalysesByCategory(analyses);

    expect(single).toHaveLength(0);
    expect(toMerge.size).toBe(1);
    expect(toMerge.get("daily")).toHaveLength(2);
  });

  it("混合ケース: 単一カテゴリと重複カテゴリが混在", () => {
    const analyses = [
      makeClusterAnalysis("tech", 100),
      makeClusterAnalysis("daily", 2000),
      makeClusterAnalysis("daily", 1500),
      makeClusterAnalysis("daily", 1800),
      makeClusterAnalysis("opinion", 200),
    ];

    const { single, toMerge } = groupAnalysesByCategory(analyses);

    expect(single).toHaveLength(2);
    expect(single.map((a) => a.category)).toEqual(
      expect.arrayContaining(["tech", "opinion"]),
    );
    expect(toMerge.size).toBe(1);
    expect(toMerge.get("daily")).toHaveLength(3);
  });
});

describe("mergeClusterAnalyses", () => {
  beforeEach(() => {
    counter = 0;
    vi.restoreAllMocks();
  });

  it("空配列を渡すと空配列を返す", async () => {
    const backend = createMockBackend(() => ({ content: "" }));
    const result = await mergeClusterAnalyses([], backend);

    expect(result).toEqual([]);
    expect(backend.calls).toHaveLength(0);
  });

  it("分割なし（各カテゴリ1つ）では LLM 呼び出しなしでそのまま返る", async () => {
    const analyses = [
      makeClusterAnalysis("tech", 100),
      makeClusterAnalysis("daily", 200),
    ];
    const backend = createMockBackend(() => ({ content: "" }));

    const result = await mergeClusterAnalyses(analyses, backend);

    expect(result).toHaveLength(2);
    expect(backend.calls).toHaveLength(0);
    expect(result[0].category).toBe("tech");
    expect(result[1].category).toBe("daily");
  });

  it("同カテゴリ複数は統合されて1つになる", async () => {
    const analyses = [
      makeClusterAnalysis("tech", 100),
      makeClusterAnalysis("daily", 2000, { portrait: "前期の人物像" }),
      makeClusterAnalysis("daily", 1500, { portrait: "後期の人物像" }),
    ];

    const mergedPortrait = "統合された人物像";
    const backend = createMockBackend(() => ({
      content: makeMergePortraitResponse(mergedPortrait),
    }));

    const result = await mergeClusterAnalyses(analyses, backend);

    expect(result).toHaveLength(2);
    expect(backend.calls).toHaveLength(1);

    const daily = result.find((a) => a.category === "daily");
    expect(daily).toBeDefined();
    expect(daily?.portrait).toBe(mergedPortrait);
  });

  it("tweetCount が全チャンクの合算値になる", async () => {
    const analyses = [
      makeClusterAnalysis("daily", 2392),
      makeClusterAnalysis("daily", 2392),
      makeClusterAnalysis("daily", 2392),
      makeClusterAnalysis("daily", 2389),
    ];

    const backend = createMockBackend(() => ({
      content: makeMergePortraitResponse("統合portrait"),
    }));

    const result = await mergeClusterAnalyses(analyses, backend);

    expect(result).toHaveLength(1);
    expect(result[0].tweetCount).toBe(2392 + 2392 + 2392 + 2389);
  });

  it("representativeTweets が各チャンクから均等に取得され最大10件", async () => {
    const analyses = [
      makeClusterAnalysis("daily", 2000, { representativeCount: 10 }),
      makeClusterAnalysis("daily", 1500, { representativeCount: 10 }),
    ];

    const backend = createMockBackend(() => ({
      content: makeMergePortraitResponse("統合portrait"),
    }));

    const result = await mergeClusterAnalyses(analyses, backend);
    const daily = result.find((a) => a.category === "daily")!;

    expect(daily.representativeTweets).toHaveLength(10);
  });

  it("4分割の場合 representativeTweets が均等取得される", async () => {
    const analyses = [
      makeClusterAnalysis("emotion", 2677, { representativeCount: 10 }),
      makeClusterAnalysis("emotion", 2677, { representativeCount: 10 }),
      makeClusterAnalysis("emotion", 2677, { representativeCount: 10 }),
      makeClusterAnalysis("emotion", 2676, { representativeCount: 10 }),
    ];

    const backend = createMockBackend(() => ({
      content: makeMergePortraitResponse("統合portrait"),
    }));

    const result = await mergeClusterAnalyses(analyses, backend);
    const emotion = result.find((a) => a.category === "emotion")!;

    // perChunk = Math.floor(10 / 4) = 2, 各チャンクから2件 = 8件 + 補充2件 = 10件
    expect(emotion.representativeTweets).toHaveLength(10);
  });

  it("attitudePatterns は全チャンクのパターンがそのまま結合される", async () => {
    const analyses = [
      makeClusterAnalysis("daily", 2000, {
        patternNames: ["パターンA", "パターンB", "パターンC"],
      }),
      makeClusterAnalysis("daily", 1500, {
        patternNames: ["パターンA", "パターンD"],
      }),
    ];

    const backend = createMockBackend(() => ({
      content: makeMergePortraitResponse("統合portrait"),
    }));

    const result = await mergeClusterAnalyses(analyses, backend);
    const daily = result.find((a) => a.category === "daily")!;

    // 重複除去されず、3 + 2 = 5件
    expect(daily.attitudePatterns).toHaveLength(5);
  });

  it("LLM 失敗時はフォールバックで最後のチャンクの portrait を採用", async () => {
    const analyses = [
      makeClusterAnalysis("daily", 2000, { portrait: "前期の人物像" }),
      makeClusterAnalysis("daily", 1500, { portrait: "後期の人物像" }),
    ];

    const backend = createMockBackend(() => ({
      content: "invalid json response",
    }));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await mergeClusterAnalyses(analyses, backend);

    const daily = result.find((a) => a.category === "daily")!;
    expect(daily.portrait).toBe("後期の人物像");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('カテゴリ "daily"'),
    );

    // ルールベース部分は正常に動作
    expect(daily.tweetCount).toBe(3500);
  });

  it("portrait 統合プロンプトに各分割の portrait が含まれる", async () => {
    const analyses = [
      makeClusterAnalysis("tech", 1500, { portrait: "前期テック人物像" }),
      makeClusterAnalysis("tech", 1200, { portrait: "後期テック人物像" }),
    ];

    const backend = createMockBackend(() => ({
      content: makeMergePortraitResponse("統合portrait"),
    }));

    await mergeClusterAnalyses(analyses, backend);

    const userMessage = backend.calls[0].messages.find(
      (m) => m.role === "user",
    )!;
    expect(userMessage.content).toContain("前期テック人物像");
    expect(userMessage.content).toContain("後期テック人物像");
    expect(userMessage.content).toContain("tech");
    expect(userMessage.content).toContain("2700");
  });

  it("temperature 0.0 でリクエストする", async () => {
    const analyses = [
      makeClusterAnalysis("daily", 2000),
      makeClusterAnalysis("daily", 1500),
    ];

    const backend = createMockBackend(() => ({
      content: makeMergePortraitResponse("統合portrait"),
    }));

    await mergeClusterAnalyses(analyses, backend);

    expect(backend.calls[0].options.temperature).toBe(0.0);
  });

  it("複数カテゴリが同時に統合される", async () => {
    const analyses = [
      makeClusterAnalysis("tech", 100),
      makeClusterAnalysis("daily", 2000),
      makeClusterAnalysis("daily", 1500),
      makeClusterAnalysis("emotion", 2000),
      makeClusterAnalysis("emotion", 1800),
    ];

    const backend = createMockBackend(() => ({
      content: makeMergePortraitResponse("統合portrait"),
    }));

    const result = await mergeClusterAnalyses(analyses, backend);

    expect(result).toHaveLength(3);
    expect(backend.calls).toHaveLength(2); // daily + emotion
    expect(result.map((a) => a.category).sort()).toEqual([
      "daily",
      "emotion",
      "tech",
    ]);
  });
});
