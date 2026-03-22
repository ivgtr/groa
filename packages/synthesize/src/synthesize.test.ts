import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  TaggedTweet,
  Category,
  ClusterAnalysis,
  StyleStats,
  CorpusMetadata,
  VoiceBankEntry,
} from "@groa/types";
import { TweetId, Timestamp, ModelIdString } from "@groa/types";
import type { LlmBackend, LlmRequest, LlmResponse } from "@groa/llm-client";
import { selectVoiceBank } from "./voice-bank.js";
import { buildSynthesizePrompt } from "./synthesize-prompt.js";
import { parseSynthesizeResponse } from "./synthesize-parse.js";
import { synthesize } from "./synthesize.js";

// --- テストヘルパー ---

let counter = 0;

function makeTaggedTweet(
  category: Category,
  sentiment: "positive" | "negative" | "neutral" | "mixed" = "neutral",
): TaggedTweet {
  counter++;
  return {
    tweet: {
      id: TweetId(`t${counter}`),
      text: `テスト${counter}のテキスト`,
      timestamp: Timestamp(Date.now() + counter),
      isRetweet: false,
      hasMedia: false,
      replyTo: null,
    },
    category,
    sentiment,
    topics: [],
  };
}

function makeClusterAnalysis(
  category: Category,
  repCount: number,
): ClusterAnalysis {
  const reps = Array.from({ length: repCount }, (_, i) =>
    makeTaggedTweet(
      category,
      (["positive", "negative", "neutral", "mixed"] as const)[i % 4],
    ),
  );
  return {
    category,
    tweetCount: 100,
    portrait: `${category}カテゴリのテスト人物像です。この人は${category}の話題について詳しく語ります。`,
    representativeTweets: reps,
    attitudePatterns: [
      {
        name: `${category}の態度`,
        description: `${category}に特有の態度パターン`,
        exampleTweetIds: reps.slice(0, 2).map((t) => t.tweet.id),
        sourceCategories: [category],
      },
    ],
  };
}

function makeStyleStats(): StyleStats {
  return {
    lengthDistribution: {
      mean: 80,
      median: 70,
      stdDev: 30,
      percentiles: { p10: 30, p25: 50, p75: 100, p90: 130 },
    },
    punctuation: {
      sentenceEnders: { "。": 50, "！": 30 },
      commaStyle: { "、": 80 },
      bracketStyles: { "（）": 10 },
    },
    sentenceEndings: [
      { ending: "だ", frequency: 30, exampleTweetIds: [TweetId("t1")] },
      { ending: "です", frequency: 20, exampleTweetIds: [TweetId("t2")] },
      { ending: "な", frequency: 15, exampleTweetIds: [TweetId("t3")] },
    ],
    charTypeRatio: {
      hiragana: 0.4,
      katakana: 0.1,
      kanji: 0.3,
      ascii: 0.15,
      emoji: 0.05,
    },
    topEmoji: [{ emoji: "😀", count: 10 }],
    topTokens: [
      { token: "技術", count: 25, isNoun: true },
      { token: "使う", count: 20, isNoun: false },
    ],
    topNgrams: { bigrams: [], trigrams: [] },
    hourlyDistribution: Array(24).fill(0),
    lineBreaks: { tweetsWithBreaks: 0.3, avgBreaksPerTweet: 0.5 },
    sharingRate: { urlRate: 0.15, mediaRate: 0.05 },
    replyRate: 0.2,
    sampleSize: 500,
    analyzedAt: Timestamp(Date.now()),
  };
}

function makeCorpusMetadata(): CorpusMetadata {
  return {
    totalCount: 500,
    dateRange: {
      start: Timestamp(Date.now() - 86400000 * 30),
      end: Timestamp(Date.now()),
    },
    filteredCount: 50,
  };
}

function makeValidSynthesizeResponse(tweetIds: string[]): string {
  return JSON.stringify({
    body:
      "# 人物像サマリ\nこの人物は技術に深い関心を持ち..." +
      "\n\n# 文体ルール\n「〜だ」という断定的な語尾を多用する。" +
      "\n\n# トピック別モード記述\n技術の話では詳細に語る。" +
      "\n\n# 思考の癖\n論理的な展開を好む。" +
      "\n\n# 感情表現の特徴\n感情表現は控えめ。" +
      "\n\n# 語彙の特徴\n「技術」「使う」を多用する。" +
      "文字数を稼ぐための追加テキスト。".repeat(50),
    attitudePatterns: [
      {
        name: "断定スタイル",
        description: "結論を先に述べる",
        exampleTweetIds: tweetIds.slice(0, 2),
        sourceCategories: ["tech", "opinion"],
      },
      {
        name: "丁寧な補足",
        description: "断定の後に理由を丁寧に補足する",
        exampleTweetIds: tweetIds.slice(0, 1),
        sourceCategories: ["tech"],
      },
    ],
    contradictions: [
      "技術の話では断定的だが、日常の話では曖昧な表現を好む",
    ],
  });
}

function createMockBackend(
  responseFn: (request: LlmRequest) => Partial<LlmResponse>,
): LlmBackend & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  const defaultResponse: LlmResponse = {
    content: "",
    inputTokens: 1000,
    outputTokens: 2000,
    modelUsed: ModelIdString("claude-opus-4-6-20250313"),
    cachedTokens: 0,
    costUsd: 0.1,
  };
  return {
    calls,
    backendType: () => "anthropic" as const,
    complete: async (request: LlmRequest): Promise<LlmResponse> => {
      calls.push(request);
      return { ...defaultResponse, ...responseFn(request) };
    },
  };
}

// --- テスト ---

describe("selectVoiceBank", () => {
  beforeEach(() => {
    counter = 0;
  });

  it("20-30件のエントリを返す", () => {
    const analyses = [
      makeClusterAnalysis("tech", 10),
      makeClusterAnalysis("daily", 10),
      makeClusterAnalysis("opinion", 10),
    ];
    const result = selectVoiceBank(analyses);
    expect(result.length).toBeGreaterThanOrEqual(20);
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it("各カテゴリから最低2件選定される", () => {
    const analyses = [
      makeClusterAnalysis("tech", 5),
      makeClusterAnalysis("daily", 5),
      makeClusterAnalysis("opinion", 5),
    ];
    const result = selectVoiceBank(analyses);

    const byCat = new Map<string, number>();
    for (const entry of result) {
      const cat = entry.tweet.category;
      byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
    }

    for (const cat of ["tech", "daily", "opinion"]) {
      expect(byCat.get(cat) ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it("selectionReason が設定される", () => {
    const analyses = [makeClusterAnalysis("tech", 5)];
    const result = selectVoiceBank(analyses);
    for (const entry of result) {
      expect(entry.selectionReason.length).toBeGreaterThan(0);
    }
  });

  it("空の分析結果で空配列を返す", () => {
    expect(selectVoiceBank([])).toHaveLength(0);
  });

  it("代表ツイートが少ない場合はその分だけ返す", () => {
    const analyses = [makeClusterAnalysis("tech", 3)];
    const result = selectVoiceBank(analyses);
    expect(result).toHaveLength(3);
  });

  it("重複エントリを含まない", () => {
    const analyses = [
      makeClusterAnalysis("tech", 10),
      makeClusterAnalysis("daily", 10),
    ];
    const result = selectVoiceBank(analyses);
    const ids = result.map((e) => e.tweet.tweet.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("buildSynthesizePrompt", () => {
  beforeEach(() => {
    counter = 0;
  });

  it("クラスタの人物像がuserメッセージに含まれる", () => {
    const analyses = [makeClusterAnalysis("tech", 3)];
    const voiceBank = selectVoiceBank(analyses);
    const { user } = buildSynthesizePrompt(
      analyses,
      makeStyleStats(),
      voiceBank,
    );
    expect(user).toContain("techカテゴリのテスト人物像");
  });

  it("文体統計がuserメッセージに含まれる", () => {
    const analyses = [makeClusterAnalysis("tech", 3)];
    const voiceBank = selectVoiceBank(analyses);
    const { user } = buildSynthesizePrompt(
      analyses,
      makeStyleStats(),
      voiceBank,
    );
    expect(user).toContain("平均80字");
    expect(user).toContain("技術");
  });

  it("ボイスバンクエントリがuserメッセージに含まれる", () => {
    const analyses = [makeClusterAnalysis("tech", 5)];
    const voiceBank = selectVoiceBank(analyses);
    const { user } = buildSynthesizePrompt(
      analyses,
      makeStyleStats(),
      voiceBank,
    );
    expect(user).toContain("#1");
    expect(user).toContain(voiceBank[0].tweet.tweet.text);
  });

  it("6セクション構成がsystemプロンプトに記載される", () => {
    const analyses = [makeClusterAnalysis("tech", 3)];
    const { system } = buildSynthesizePrompt(
      analyses,
      makeStyleStats(),
      selectVoiceBank(analyses),
    );
    expect(system).toContain("人物像サマリ");
    expect(system).toContain("文体ルール");
    expect(system).toContain("トピック別モード記述");
    expect(system).toContain("思考の癖");
    expect(system).toContain("感情表現の特徴");
    expect(system).toContain("語彙の特徴");
  });
});

describe("parseSynthesizeResponse", () => {
  beforeEach(() => {
    counter = 0;
    vi.restoreAllMocks();
  });

  it("正常なレスポンスをPersonaDocumentにパースする", () => {
    const voiceBank: VoiceBankEntry[] = [
      { tweet: makeTaggedTweet("tech"), selectionReason: "代表" },
    ];
    const tweetIds = voiceBank.map((v) => v.tweet.tweet.id as string);
    const response = makeValidSynthesizeResponse(tweetIds);

    const result = parseSynthesizeResponse(
      response,
      voiceBank,
      makeCorpusMetadata(),
    );

    expect(result).not.toBeNull();
    expect(result?.version).toBe("1.0");
    expect(result?.body.length).toBeGreaterThan(0);
    expect(result?.voiceBank).toBe(voiceBank);
    expect(result?.attitudePatterns.length).toBeGreaterThan(0);
    expect(result?.contradictions.length).toBeGreaterThan(0);
  });

  it("不正なJSONでnullを返す", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseSynthesizeResponse(
      "invalid",
      [],
      makeCorpusMetadata(),
    );
    expect(result).toBeNull();
  });

  it("必須フィールド欠落でnullを返す", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseSynthesizeResponse(
      JSON.stringify({ body: "test" }),
      [],
      makeCorpusMetadata(),
    );
    expect(result).toBeNull();
  });

  it("attitudePatternsのsourceCategoriesが保持される", () => {
    const voiceBank: VoiceBankEntry[] = [];
    const response = makeValidSynthesizeResponse([]);

    const result = parseSynthesizeResponse(
      response,
      voiceBank,
      makeCorpusMetadata(),
    );

    expect(result?.attitudePatterns[0].sourceCategories).toContain("tech");
    expect(result?.attitudePatterns[0].sourceCategories).toContain("opinion");
  });
});

describe("synthesize", () => {
  beforeEach(() => {
    counter = 0;
    vi.restoreAllMocks();
  });

  it("temperature 0.2でリクエストする", async () => {
    const analyses = [makeClusterAnalysis("tech", 5)];
    const tweetIds = analyses[0].representativeTweets.map(
      (t) => t.tweet.id as string,
    );

    const backend = createMockBackend(() => ({
      content: makeValidSynthesizeResponse(tweetIds),
    }));

    await synthesize(analyses, makeStyleStats(), makeCorpusMetadata(), backend);

    expect(backend.calls[0].options.temperature).toBe(0.2);
  });

  it("正常なレスポンスでPersonaDocumentを返す", async () => {
    const analyses = [
      makeClusterAnalysis("tech", 5),
      makeClusterAnalysis("daily", 5),
    ];
    const allTweetIds = analyses.flatMap((a) =>
      a.representativeTweets.map((t) => t.tweet.id as string),
    );

    const backend = createMockBackend(() => ({
      content: makeValidSynthesizeResponse(allTweetIds),
    }));

    const result = await synthesize(
      analyses,
      makeStyleStats(),
      makeCorpusMetadata(),
      backend,
    );

    expect(result.body.length).toBeGreaterThan(0);
    expect(result.voiceBank.length).toBeGreaterThan(0);
    expect(result.attitudePatterns.length).toBeGreaterThan(0);
    expect(result.sourceStats.totalCount).toBe(500);
  });

  it("バリデーション失敗時にリトライする", async () => {
    const analyses = [makeClusterAnalysis("tech", 5)];
    const tweetIds = analyses[0].representativeTweets.map(
      (t) => t.tweet.id as string,
    );

    let callCount = 0;
    const backend = createMockBackend(() => {
      callCount++;
      if (callCount <= 2) return { content: "invalid json" };
      return { content: makeValidSynthesizeResponse(tweetIds) };
    });

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await synthesize(
      analyses,
      makeStyleStats(),
      makeCorpusMetadata(),
      backend,
    );

    expect(backend.calls).toHaveLength(3);
    expect(result.body.length).toBeGreaterThan(0);
  });

  it("全リトライ失敗でエラーをスローする", async () => {
    const analyses = [makeClusterAnalysis("tech", 5)];
    const backend = createMockBackend(() => ({ content: "invalid" }));

    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      synthesize(analyses, makeStyleStats(), makeCorpusMetadata(), backend),
    ).rejects.toThrow("3回すべて失敗");

    expect(backend.calls).toHaveLength(3);
  });
});
