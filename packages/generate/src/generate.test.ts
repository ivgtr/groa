import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  PersonaDocument,
  TaggedTweet,
  Category,
  VoiceBankEntry,
} from "@groa/types";
import { TweetId, Timestamp, ModelIdString } from "@groa/types";
import type { LlmBackend, LlmRequest, LlmResponse } from "@groa/llm-client";
import { buildGeneratePrompt } from "./generate-prompt.js";
import { generate } from "./generate.js";

// --- テストヘルパー ---

let counter = 0;

function makeTaggedTweet(
  category: Category,
  sentiment: "positive" | "negative" | "neutral" | "mixed" = "neutral",
  topics: string[] = [],
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
    topics,
  };
}

function makeVoiceBankEntry(
  category: Category,
  topics: string[] = [],
): VoiceBankEntry {
  return {
    tweet: makeTaggedTweet(category, "neutral", topics),
    selectionReason: `${category}カテゴリの代表ツイート`,
  };
}

function makePersonaDocument(voiceBankCount: number = 8): PersonaDocument {
  const voiceBank: VoiceBankEntry[] = [];
  for (let i = 0; i < voiceBankCount; i++) {
    const categories: Category[] = ["tech", "daily", "opinion", "emotion", "creative", "other"];
    const cat = categories[i % categories.length];
    const topics = cat === "tech" ? ["プログラミング", "TypeScript"] : ["日常"];
    voiceBank.push(makeVoiceBankEntry(cat, topics));
  }

  return {
    version: "1.0",
    createdAt: Timestamp(Date.now()),
    body: "# 人物像サマリ\nこの人物は技術に深い関心を持つエンジニア。\n\n# 文体ルール\n断定的な語尾を使う。",
    voiceBank,
    attitudePatterns: [
      {
        name: "断定スタイル",
        description: "結論を先に述べる",
        exampleTweetIds: [TweetId("t1")],
        sourceCategories: ["tech"],
      },
    ],
    contradictions: ["技術の話では断定的だが、日常の話では曖昧"],
    sourceStats: {
      totalCount: 500,
      dateRange: {
        start: Timestamp(Date.now() - 86400000 * 30),
        end: Timestamp(Date.now()),
      },
      filteredCount: 50,
    },
  };
}

function createMockBackend(
  responseFn: (request: LlmRequest) => Partial<LlmResponse>,
  backendTypeValue: "anthropic" | "openrouter" | "claude-code" = "anthropic",
): LlmBackend & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  const defaultResponse: LlmResponse = {
    content: "",
    inputTokens: 1000,
    outputTokens: 200,
    modelUsed: ModelIdString("claude-sonnet-4-20250514"),
    cachedTokens: 0,
    costUsd: 0.01,
  };
  return {
    calls,
    backendType: () => backendTypeValue,
    complete: async (request: LlmRequest): Promise<LlmResponse> => {
      calls.push(request);
      return { ...defaultResponse, ...responseFn(request) };
    },
  };
}

// --- テスト ---

describe("buildGeneratePrompt", () => {
  beforeEach(() => {
    counter = 0;
  });

  it("システムプロンプトにPersonaDocument.bodyが含まれる", () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];
    const { system } = buildGeneratePrompt(persona, "技術", fewShots, {
      maxLength: 280,
      styleHint: null,
    });

    expect(system).toContain("# 人物像サマリ");
    expect(system).toContain("この人物は技術に深い関心を持つエンジニア");
  });

  it("システムプロンプトにボイスバンクエントリが含まれる（5-10件）", () => {
    const persona = makePersonaDocument(12);
    const fewShots = [makeTaggedTweet("tech")];
    const { system } = buildGeneratePrompt(persona, "技術", fewShots, {
      maxLength: 280,
      styleHint: null,
    });

    expect(system).toContain("ボイスバンク参照");
    // 12件中最大10件が選択される
    expect(system).toContain("#1");
    const matchCount = (system.match(/#\d+/g) ?? []).length;
    expect(matchCount).toBeGreaterThanOrEqual(5);
    expect(matchCount).toBeLessThanOrEqual(10);
  });

  it("システムプロンプトに最大文字数ルールが含まれる", () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];
    const { system } = buildGeneratePrompt(persona, "技術", fewShots, {
      maxLength: 140,
      styleHint: null,
    });

    expect(system).toContain("最大140文字");
  });

  it("ユーザーメッセージにトピックが含まれる", () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];
    const { user } = buildGeneratePrompt(persona, "TypeScriptの型システム", fewShots, {
      maxLength: 280,
      styleHint: null,
    });

    expect(user).toContain("TypeScriptの型システム");
  });

  it("ユーザーメッセージにfew-shotツイートのテキストが含まれる", () => {
    const persona = makePersonaDocument();
    const fewShots = [
      makeTaggedTweet("tech"),
      makeTaggedTweet("tech"),
    ];
    const { user } = buildGeneratePrompt(persona, "技術", fewShots, {
      maxLength: 280,
      styleHint: null,
    });

    for (const shot of fewShots) {
      expect(user).toContain(shot.tweet.text);
    }
  });

  it("styleHintが指定された場合にシステムプロンプトに含まれる", () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];
    const { system } = buildGeneratePrompt(persona, "技術", fewShots, {
      maxLength: 280,
      styleHint: "皮肉っぽいトーンで",
    });

    expect(system).toContain("皮肉っぽいトーンで");
  });

  it("styleHintがnullの場合はスタイルヒントの行が含まれない", () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];
    const { system } = buildGeneratePrompt(persona, "技術", fewShots, {
      maxLength: 280,
      styleHint: null,
    });

    expect(system).not.toContain("スタイルヒント:");
  });
});

describe("generate", () => {
  beforeEach(() => {
    counter = 0;
    vi.restoreAllMocks();
  });

  it("Sonnetモデルでリクエストする", async () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];

    const backend = createMockBackend(() => ({
      content: "技術の話は楽しいよね。",
    }));

    await generate(persona, fewShots, backend, { topic: "技術" });

    expect(backend.calls[0].model).toBe("sonnet");
  });

  it("デフォルトtemperature 0.7を使用する", async () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];

    const backend = createMockBackend(() => ({
      content: "技術の話は楽しいよね。",
    }));

    await generate(persona, fewShots, backend, { topic: "技術" });

    expect(backend.calls[0].options.temperature).toBe(0.7);
  });

  it("paramsで指定したtemperatureを使用する", async () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];

    const backend = createMockBackend(() => ({
      content: "技術の話は楽しいよね。",
    }));

    await generate(persona, fewShots, backend, {
      topic: "技術",
      temperature: 0.9,
    });

    expect(backend.calls[0].options.temperature).toBe(0.9);
  });

  it("anthropicバックエンドではPrompt Cachingが有効", async () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];

    const backend = createMockBackend(
      () => ({ content: "技術の話は楽しいよね。" }),
      "anthropic",
    );

    await generate(persona, fewShots, backend, { topic: "技術" });

    expect(backend.calls[0].options.useCache).toBe(true);
  });

  it("claude-codeバックエンドではPrompt Cachingが無効", async () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];

    const backend = createMockBackend(
      () => ({ content: "技術の話は楽しいよね。" }),
      "claude-code",
    );

    await generate(persona, fewShots, backend, { topic: "技術" });

    expect(backend.calls[0].options.useCache).toBe(false);
  });

  it("単一バリアントはGeneratedText（配列ではない）を返す", async () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];

    const backend = createMockBackend(() => ({
      content: "技術の話は楽しいよね。",
    }));

    const result = await generate(persona, fewShots, backend, {
      topic: "技術",
      numVariants: 1,
    });

    expect(Array.isArray(result)).toBe(false);
    expect(result).toHaveProperty("text", "技術の話は楽しいよね。");
  });

  it("複数バリアントはGeneratedText[]を返す", async () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];

    let callCount = 0;
    const backend = createMockBackend(() => {
      callCount++;
      return { content: `バリアント${callCount}のテキスト` };
    });

    const result = await generate(persona, fewShots, backend, {
      topic: "技術",
      numVariants: 3,
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
  });

  it("fewShotIdsが正しく記録される", async () => {
    const persona = makePersonaDocument();
    const fewShots = [
      makeTaggedTweet("tech"),
      makeTaggedTweet("daily"),
    ];
    const expectedIds = fewShots.map((t) => t.tweet.id);

    const backend = createMockBackend(() => ({
      content: "テスト生成テキスト",
    }));

    const result = await generate(persona, fewShots, backend, {
      topic: "技術",
    });

    expect(Array.isArray(result)).toBe(false);
    if (!Array.isArray(result)) {
      expect(result.fewShotIds).toEqual(expectedIds);
    }
  });

  it("evaluationがnullである", async () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];

    const backend = createMockBackend(() => ({
      content: "テスト生成テキスト",
    }));

    const result = await generate(persona, fewShots, backend, {
      topic: "技術",
    });

    if (!Array.isArray(result)) {
      expect(result.evaluation).toBeNull();
    }
  });

  it("バリデーション失敗時にリトライする（最大2回リトライ = 計3回）", async () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];

    let callCount = 0;
    const backend = createMockBackend(() => {
      callCount++;
      if (callCount <= 2) return { content: "   " }; // 空白のみ = バリデーション失敗
      return { content: "3回目で成功したテキスト" };
    });

    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await generate(persona, fewShots, backend, {
      topic: "技術",
    });

    expect(backend.calls).toHaveLength(3);
    if (!Array.isArray(result)) {
      expect(result.text).toBe("3回目で成功したテキスト");
    }
  });

  it("全リトライ失敗でエラーをスローする", async () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];

    const backend = createMockBackend(() => ({ content: "" }));

    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      generate(persona, fewShots, backend, { topic: "技術" }),
    ).rejects.toThrow("3回すべて失敗");

    expect(backend.calls).toHaveLength(3);
  });

  it("modelUsedがレスポンスから取得される", async () => {
    const persona = makePersonaDocument();
    const fewShots = [makeTaggedTweet("tech")];

    const expectedModel = ModelIdString("claude-sonnet-4-20250514");
    const backend = createMockBackend(() => ({
      content: "テスト生成テキスト",
      modelUsed: expectedModel,
    }));

    const result = await generate(persona, fewShots, backend, {
      topic: "技術",
    });

    if (!Array.isArray(result)) {
      expect(result.modelUsed).toBe(expectedModel);
    }
  });
});
