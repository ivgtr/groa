import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Tweet, TweetCorpus } from "@groa/types";
import {
  TweetId,
  Timestamp,
  CATEGORIES,
  SENTIMENTS,
} from "@groa/types";
import type { LlmBackend, LlmRequest, LlmResponse } from "@groa/llm-client";
import { ModelIdString } from "@groa/types";
import { classify, splitIntoBatches, buildLlmRequest } from "./classify.js";
import { buildClassifyPrompt } from "./prompt.js";
import { parseClassifyResponse } from "./parse.js";

// --- テストヘルパー ---

function makeTweet(id: string, text: string): Tweet {
  return {
    id: TweetId(id),
    text,
    timestamp: Timestamp(Date.now()),
    isRetweet: false,
    hasMedia: false,
    replyTo: null,
  };
}

function makeCorpus(tweets: Tweet[]): TweetCorpus {
  return {
    tweets,
    metadata: {
      totalCount: tweets.length,
      dateRange: {
        start: Timestamp(Date.now() - 86400000),
        end: Timestamp(Date.now()),
      },
      filteredCount: 0,
    },
  };
}

function createMockBackend(
  responseFn: (request: LlmRequest) => Partial<LlmResponse>,
): LlmBackend & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  const defaultResponse: LlmResponse = {
    content: "",
    inputTokens: 100,
    outputTokens: 50,
    modelUsed: ModelIdString("claude-haiku-4-5-20251001"),
    cachedTokens: 0,
    costUsd: 0.001,
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

/** リクエストのuserメッセージからツイートIDリストを抽出する */
function extractTweetIds(request: LlmRequest): string[] {
  const userMsg = request.messages.find((m) => m.role === "user");
  if (!userMsg) return [];
  const match = userMsg.content.match(/\[[\s\S]*\]/);
  if (!match) return [];
  const tweetList = JSON.parse(match[0]) as { id: string }[];
  return tweetList.map((t) => t.id);
}

/** 全ツイートに固定値を返すレスポンスを生成する */
function makeSuccessResponse(request: LlmRequest): Partial<LlmResponse> {
  const ids = extractTweetIds(request);
  return {
    content: JSON.stringify(
      ids.map((id) => ({
        tweetId: id,
        category: "tech",
        sentiment: "positive",
        topics: ["テスト"],
      })),
    ),
  };
}

// --- テスト ---

describe("splitIntoBatches", () => {
  it("50件ずつのバッチに分割する", () => {
    const tweets = Array.from({ length: 120 }, (_, i) =>
      makeTweet(`t${i}`, `テスト${i}`),
    );
    const batches = splitIntoBatches(tweets, 50);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(50);
    expect(batches[1]).toHaveLength(50);
    expect(batches[2]).toHaveLength(20);
  });

  it("バッチサイズ未満の場合は1バッチ", () => {
    const tweets = Array.from({ length: 10 }, (_, i) =>
      makeTweet(`t${i}`, `テスト${i}`),
    );
    const batches = splitIntoBatches(tweets, 50);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(10);
  });

  it("バッチサイズの倍数の場合は端数なし", () => {
    const tweets = Array.from({ length: 100 }, (_, i) =>
      makeTweet(`t${i}`, `テスト${i}`),
    );
    const batches = splitIntoBatches(tweets, 50);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(50);
    expect(batches[1]).toHaveLength(50);
  });

  it("空配列の場合は空配列を返す", () => {
    const batches = splitIntoBatches([], 50);
    expect(batches).toHaveLength(0);
  });
});

describe("buildLlmRequest", () => {
  it("temperature 0.0 が指定される", () => {
    const tweets = [makeTweet("t1", "テスト")];
    const request = buildLlmRequest(tweets);
    expect(request.options.temperature).toBe(0.0);
  });

  it("systemメッセージとuserメッセージが含まれる", () => {
    const tweets = [makeTweet("t1", "テスト")];
    const request = buildLlmRequest(tweets);
    expect(request.messages).toHaveLength(2);
    expect(request.messages[0].role).toBe("system");
    expect(request.messages[1].role).toBe("user");
  });

  it("ツイートIDとテキストがuserメッセージに含まれる", () => {
    const tweets = [makeTweet("t1", "TypeScript最高")];
    const request = buildLlmRequest(tweets);
    expect(request.messages[1].content).toContain("t1");
    expect(request.messages[1].content).toContain("TypeScript最高");
  });

  it("useBatch: true が指定される", () => {
    const tweets = [makeTweet("t1", "テスト")];
    const request = buildLlmRequest(tweets);
    expect(request.options.useBatch).toBe(true);
  });
});

describe("buildClassifyPrompt", () => {
  it("全カテゴリがシステムプロンプトに含まれる", () => {
    const tweets = [makeTweet("t1", "テスト")];
    const { system } = buildClassifyPrompt(tweets);
    for (const cat of CATEGORIES) {
      expect(system).toContain(`"${cat}"`);
    }
  });

  it("全センチメントがシステムプロンプトに含まれる", () => {
    const tweets = [makeTweet("t1", "テスト")];
    const { system } = buildClassifyPrompt(tweets);
    for (const sent of SENTIMENTS) {
      expect(system).toContain(`"${sent}"`);
    }
  });

  it("ツイート件数がuserメッセージに含まれる", () => {
    const tweets = [makeTweet("t1", "テスト1"), makeTweet("t2", "テスト2")];
    const { user } = buildClassifyPrompt(tweets);
    expect(user).toContain("2件");
  });
});

describe("parseClassifyResponse", () => {
  it("正常なJSONレスポンスをパースする", () => {
    const tweets = [
      makeTweet("t1", "TypeScript最高"),
      makeTweet("t2", "今日は雨"),
    ];
    const response = JSON.stringify([
      {
        tweetId: "t1",
        category: "tech",
        sentiment: "positive",
        topics: ["TypeScript"],
      },
      {
        tweetId: "t2",
        category: "daily",
        sentiment: "negative",
        topics: ["天気"],
      },
    ]);

    const { tagged, fallbackCount } = parseClassifyResponse(response, tweets);
    expect(tagged).toHaveLength(2);
    expect(fallbackCount).toBe(0);
    expect(tagged.find((t) => t.tweet.id === "t1")?.category).toBe("tech");
    expect(tagged.find((t) => t.tweet.id === "t2")?.category).toBe("daily");
  });

  it("コードブロック内のJSONをパースする", () => {
    const tweets = [makeTweet("t1", "テスト")];
    const response =
      '```json\n[{"tweetId": "t1", "category": "tech", "sentiment": "positive", "topics": []}]\n```';

    const { tagged, fallbackCount } = parseClassifyResponse(response, tweets);
    expect(tagged).toHaveLength(1);
    expect(fallbackCount).toBe(0);
    expect(tagged[0].category).toBe("tech");
  });

  it("不正なJSONの場合は全件フォールバック", () => {
    const tweets = [makeTweet("t1", "テスト"), makeTweet("t2", "テスト2")];
    const { tagged, fallbackCount } = parseClassifyResponse(
      "invalid json",
      tweets,
    );
    expect(tagged).toHaveLength(2);
    expect(fallbackCount).toBe(2);
    expect(tagged.every((t) => t.category === "other")).toBe(true);
    expect(tagged.every((t) => t.sentiment === "neutral")).toBe(true);
  });

  it("不正なカテゴリの場合はそのツイートのみフォールバック", () => {
    const tweets = [makeTweet("t1", "テスト1"), makeTweet("t2", "テスト2")];
    const response = JSON.stringify([
      {
        tweetId: "t1",
        category: "invalid_cat",
        sentiment: "positive",
        topics: [],
      },
      {
        tweetId: "t2",
        category: "tech",
        sentiment: "positive",
        topics: [],
      },
    ]);

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { tagged, fallbackCount } = parseClassifyResponse(response, tweets);
    expect(tagged).toHaveLength(2);
    expect(fallbackCount).toBe(1);
    expect(tagged.find((t) => t.tweet.id === "t1")?.category).toBe("other");
    expect(tagged.find((t) => t.tweet.id === "t1")?.sentiment).toBe("neutral");
    expect(tagged.find((t) => t.tweet.id === "t2")?.category).toBe("tech");
  });

  it("欠落ツイートにはフォールバック値が付与される", () => {
    const tweets = [makeTweet("t1", "テスト1"), makeTweet("t2", "テスト2")];
    const response = JSON.stringify([
      {
        tweetId: "t1",
        category: "tech",
        sentiment: "positive",
        topics: [],
      },
    ]);

    const { tagged, fallbackCount } = parseClassifyResponse(response, tweets);
    expect(tagged).toHaveLength(2);
    expect(fallbackCount).toBe(1);
    expect(tagged.find((t) => t.tweet.id === "t2")?.category).toBe("other");
  });

  it("topicsが5件に制限される", () => {
    const tweets = [makeTweet("t1", "テスト")];
    const response = JSON.stringify([
      {
        tweetId: "t1",
        category: "tech",
        sentiment: "positive",
        topics: ["a", "b", "c", "d", "e", "f", "g"],
      },
    ]);

    const { tagged } = parseClassifyResponse(response, tweets);
    expect(tagged[0].topics).toHaveLength(5);
  });

  it("空配列のレスポンスで全件フォールバック", () => {
    const tweets = [makeTweet("t1", "テスト")];
    const { tagged, fallbackCount } = parseClassifyResponse("[]", tweets);
    expect(tagged).toHaveLength(1);
    expect(fallbackCount).toBe(1);
  });

  it("非配列のJSONで全件フォールバック", () => {
    const tweets = [makeTweet("t1", "テスト")];
    const { tagged, fallbackCount } = parseClassifyResponse(
      '{"error": "something"}',
      tweets,
    );
    expect(tagged).toHaveLength(1);
    expect(fallbackCount).toBe(1);
  });

  it("重複tweetIdは最初の1件のみ採用する", () => {
    const tweets = [makeTweet("t1", "テスト")];
    const response = JSON.stringify([
      {
        tweetId: "t1",
        category: "tech",
        sentiment: "positive",
        topics: ["A"],
      },
      {
        tweetId: "t1",
        category: "daily",
        sentiment: "negative",
        topics: ["B"],
      },
    ]);

    const { tagged, fallbackCount } = parseClassifyResponse(response, tweets);
    expect(tagged).toHaveLength(1);
    expect(fallbackCount).toBe(0);
    expect(tagged[0].category).toBe("tech");
    expect(tagged[0].topics).toEqual(["A"]);
  });
});

describe("classify", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("空のコーパスで空配列を返す", async () => {
    const corpus = makeCorpus([]);
    const backend = createMockBackend(() => ({ content: "[]" }));
    const result = await classify(corpus, backend, null);
    expect(result).toHaveLength(0);
    expect(backend.calls).toHaveLength(0);
  });

  it("逐次実行で全ツイートを分類する", async () => {
    const tweets = Array.from({ length: 3 }, (_, i) =>
      makeTweet(`t${i}`, `テスト${i}`),
    );
    const corpus = makeCorpus(tweets);
    const backend = createMockBackend(makeSuccessResponse);

    const result = await classify(corpus, backend, null, { batchSize: 50 });
    expect(result).toHaveLength(3);
    expect(backend.calls).toHaveLength(1);
    expect(result.every((t) => t.category === "tech")).toBe(true);
  });

  it("バッチサイズに従って複数リクエストに分割する", async () => {
    const tweets = Array.from({ length: 5 }, (_, i) =>
      makeTweet(`t${i}`, `テスト${i}`),
    );
    const corpus = makeCorpus(tweets);
    const backend = createMockBackend(makeSuccessResponse);

    const result = await classify(corpus, backend, null, { batchSize: 2 });
    expect(result).toHaveLength(5);
    expect(backend.calls).toHaveLength(3); // 2+2+1
  });

  it("進捗コールバックが呼ばれる", async () => {
    const tweets = Array.from({ length: 4 }, (_, i) =>
      makeTweet(`t${i}`, `テスト${i}`),
    );
    const corpus = makeCorpus(tweets);
    const backend = createMockBackend(makeSuccessResponse);

    const progress = vi.fn();
    await classify(corpus, backend, null, {
      batchSize: 2,
      onProgress: progress,
    });

    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith(2, 4);
    expect(progress).toHaveBeenCalledWith(4, 4);
  });

  it("フォールバック率10%超でリトライする", async () => {
    const tweets = Array.from({ length: 10 }, (_, i) =>
      makeTweet(`t${i}`, `テスト${i}`),
    );
    const corpus = makeCorpus(tweets);

    let callCount = 0;
    const backend = createMockBackend((request: LlmRequest) => {
      callCount++;
      const ids = extractTweetIds(request);

      if (callCount <= 1) {
        // 1回目: 10件中8件のみ返す（20%失敗 > 10%閾値）
        return {
          content: JSON.stringify(
            ids.slice(0, 8).map((id) => ({
              tweetId: id,
              category: "tech",
              sentiment: "positive",
              topics: [],
            })),
          ),
        };
      }
      // リトライ: 全件返す
      return {
        content: JSON.stringify(
          ids.map((id) => ({
            tweetId: id,
            category: "tech",
            sentiment: "positive",
            topics: [],
          })),
        ),
      };
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await classify(corpus, backend, null, { batchSize: 50 });
    expect(result).toHaveLength(10);
    expect(backend.calls).toHaveLength(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("リトライします"),
    );
    // リトライ後の結果が全件フォールバックなしであること
    expect(result.every((t) => t.category === "tech")).toBe(true);
    expect(result.every((t) => t.sentiment === "positive")).toBe(true);
  });

  it("フォールバック率10%以下ではリトライしない", async () => {
    const tweets = Array.from({ length: 20 }, (_, i) =>
      makeTweet(`t${i}`, `テスト${i}`),
    );
    const corpus = makeCorpus(tweets);

    const backend = createMockBackend((request: LlmRequest) => {
      const ids = extractTweetIds(request);
      // 20件中19件返す（5%失敗 < 10%閾値）
      return {
        content: JSON.stringify(
          ids.slice(0, ids.length - 1).map((id) => ({
            tweetId: id,
            category: "tech",
            sentiment: "positive",
            topics: [],
          })),
        ),
      };
    });

    await classify(corpus, backend, null, { batchSize: 50 });
    // batchSize=50なので1バッチ、リトライなしで1回
    expect(backend.calls).toHaveLength(1);
  });

  it("リクエストにtemperature 0.0が設定される", async () => {
    const tweets = [makeTweet("t1", "テスト")];
    const corpus = makeCorpus(tweets);
    const backend = createMockBackend(makeSuccessResponse);

    await classify(corpus, backend, null);
    expect(backend.calls[0].options.temperature).toBe(0.0);
  });

  it("デフォルトバッチサイズは50", async () => {
    const tweets = Array.from({ length: 60 }, (_, i) =>
      makeTweet(`t${i}`, `テスト${i}`),
    );
    const corpus = makeCorpus(tweets);
    const backend = createMockBackend(makeSuccessResponse);

    await classify(corpus, backend, null);
    expect(backend.calls).toHaveLength(2); // 50+10
  });

  it("Batch API経由で分類する（batchClient指定時）", async () => {
    const tweets = Array.from({ length: 5 }, (_, i) =>
      makeTweet(`t${i}`, `テスト${i}`),
    );
    const corpus = makeCorpus(tweets);
    const backend = createMockBackend(() => ({ content: "[]" }));

    const mockBatchClient = {
      submitWithRetry: vi.fn(
        async (requests: { customId: string; request: LlmRequest }[]) => {
          return requests.map((req) => {
            const ids = extractTweetIds(req.request);
            return {
              customId: req.customId,
              response: {
                content: JSON.stringify(
                  ids.map((id) => ({
                    tweetId: id,
                    category: "opinion",
                    sentiment: "mixed",
                    topics: ["政治"],
                  })),
                ),
                inputTokens: 200,
                outputTokens: 100,
                modelUsed: ModelIdString("claude-haiku-4-5-20251001"),
                cachedTokens: 0,
                costUsd: 0.001,
              },
              error: null,
            };
          });
        },
      ),
    };

    const result = await classify(
      corpus,
      backend,
      mockBatchClient as never,
      { batchSize: 3 },
    );

    expect(result).toHaveLength(5);
    expect(result.every((t) => t.category === "opinion")).toBe(true);
    expect(result.every((t) => t.sentiment === "mixed")).toBe(true);
    // backend.complete は呼ばれない（Batch API使用時）
    expect(backend.calls).toHaveLength(0);
    // submitWithRetry が呼ばれた
    expect(mockBatchClient.submitWithRetry).toHaveBeenCalledOnce();
    // 2バッチ（3+2）が投入された
    const submittedRequests = mockBatchClient.submitWithRetry.mock.calls[0][0];
    expect(submittedRequests).toHaveLength(2);
  });

  it("Batch APIでレスポンスがnullの場合はフォールバック", async () => {
    const tweets = Array.from({ length: 3 }, (_, i) =>
      makeTweet(`t${i}`, `テスト${i}`),
    );
    const corpus = makeCorpus(tweets);
    const backend = createMockBackend(() => ({ content: "[]" }));

    const mockBatchClient = {
      submitWithRetry: vi.fn(async () => [
        {
          customId: "classify-batch-0",
          response: null,
          error: "Internal error",
        },
      ]),
    };

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await classify(corpus, backend, mockBatchClient as never, {
      batchSize: 50,
    });

    // 全件フォールバック + リトライ（100% > 10%閾値）
    expect(result).toHaveLength(3);
    expect(result.every((t) => t.category === "other")).toBe(true);
    expect(result.every((t) => t.sentiment === "neutral")).toBe(true);
  });
});
