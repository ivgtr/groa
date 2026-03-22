import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  PersonaDocument,
  TaggedTweet,
  GeneratedText,
  Category,
  VoiceBankEntry,
} from "@groa/types";
import { TweetId, Timestamp, ModelIdString } from "@groa/types";
import type { LlmBackend, LlmRequest, LlmResponse } from "@groa/llm-client";
import { buildEvaluatePrompt } from "./evaluate-prompt.js";
import { parseEvaluateResponse } from "./evaluate-parse.js";
import { evaluate, isPassingEvaluation } from "./evaluate.js";

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

function makePersonaDocument(voiceBankCount: number = 5): PersonaDocument {
  const voiceBank: VoiceBankEntry[] = [];
  const categories: Category[] = [
    "tech",
    "daily",
    "opinion",
    "emotion",
    "creative",
    "other",
  ];
  for (let i = 0; i < voiceBankCount; i++) {
    const cat = categories[i % categories.length];
    voiceBank.push(makeVoiceBankEntry(cat));
  }

  return {
    version: "1.0",
    createdAt: Timestamp(Date.now()),
    body: "# 人物像サマリ\nこの人物は技術に深い関心を持つエンジニア。",
    voiceBank,
    attitudePatterns: [
      {
        name: "断定スタイル",
        description: "結論を先に述べる",
        exampleTweetIds: [TweetId("t1")],
        sourceCategories: ["tech"],
      },
    ],
    contradictions: [],
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

function makeGeneratedText(): GeneratedText {
  return {
    text: "テスト生成テキスト。技術の話は楽しいよね。",
    topic: "技術",
    evaluation: null,
    fewShotIds: [TweetId("t100"), TweetId("t101")],
    modelUsed: ModelIdString("claude-sonnet-4-20250514"),
  };
}

function makeValidEvaluationResponse(): string {
  return JSON.stringify({
    authenticity: 8.5,
    styleNaturalness: 7.0,
    attitudeConsistency: 9.0,
    rationale: "文体が一貫しており、技術的な話題に対する態度も適切。",
  });
}

function createMockBackend(
  responseFn: (request: LlmRequest) => Partial<LlmResponse>,
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
    backendType: () => "anthropic" as const,
    complete: async (request: LlmRequest): Promise<LlmResponse> => {
      calls.push(request);
      return { ...defaultResponse, ...responseFn(request) };
    },
  };
}

// --- テスト ---

describe("buildEvaluatePrompt", () => {
  beforeEach(() => {
    counter = 0;
  });

  it("システムプロンプトに「文体分析の専門家」が含まれる", () => {
    const generated = makeGeneratedText();
    const evalTweets = [makeTaggedTweet("tech"), makeTaggedTweet("daily")];
    const persona = makePersonaDocument();

    const { system } = buildEvaluatePrompt(generated, evalTweets, persona);

    expect(system).toContain("文体分析の専門家");
  });

  it("ユーザーメッセージに評価ツイートのテキストが含まれる", () => {
    const generated = makeGeneratedText();
    const evalTweets = [
      makeTaggedTweet("tech"),
      makeTaggedTweet("daily"),
      makeTaggedTweet("opinion"),
    ];
    const persona = makePersonaDocument();

    const { user } = buildEvaluatePrompt(generated, evalTweets, persona);

    for (const tweet of evalTweets) {
      expect(user).toContain(tweet.tweet.text);
    }
  });

  it("ユーザーメッセージにボイスバンクエントリが含まれる（最大5件）", () => {
    const generated = makeGeneratedText();
    const evalTweets = [makeTaggedTweet("tech")];
    const persona = makePersonaDocument(5);

    const { user } = buildEvaluatePrompt(generated, evalTweets, persona);

    expect(user).toContain("ボイスバンク");
    for (const vb of persona.voiceBank.slice(0, 5)) {
      expect(user).toContain(vb.tweet.tweet.text);
    }
  });

  it("ユーザーメッセージに生成テキストが含まれる", () => {
    const generated = makeGeneratedText();
    const evalTweets = [makeTaggedTweet("tech")];
    const persona = makePersonaDocument();

    const { user } = buildEvaluatePrompt(generated, evalTweets, persona);

    expect(user).toContain(generated.text);
  });

  it("ユーザーメッセージに評価基準が含まれる", () => {
    const generated = makeGeneratedText();
    const evalTweets = [makeTaggedTweet("tech")];
    const persona = makePersonaDocument();

    const { user } = buildEvaluatePrompt(generated, evalTweets, persona);

    expect(user).toContain("authenticity");
    expect(user).toContain("styleNaturalness");
    expect(user).toContain("attitudeConsistency");
    expect(user).toContain("rationale");
  });

  it("ボイスバンクが6件以上でも最大5件に制限される", () => {
    const generated = makeGeneratedText();
    const evalTweets = [makeTaggedTweet("tech")];
    const persona = makePersonaDocument(8);

    const { user } = buildEvaluatePrompt(generated, evalTweets, persona);

    // 最初の5件は含まれる
    for (const vb of persona.voiceBank.slice(0, 5)) {
      expect(user).toContain(vb.tweet.tweet.text);
    }
    // 6件目以降は含まれない
    for (const vb of persona.voiceBank.slice(5)) {
      expect(user).not.toContain(vb.tweet.tweet.text);
    }
  });
});

describe("parseEvaluateResponse", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("正常なJSONレスポンスをパースできる", () => {
    const response = makeValidEvaluationResponse();
    const result = parseEvaluateResponse(response);

    expect(result).not.toBeNull();
    expect(result?.authenticity).toBe(8.5);
    expect(result?.styleNaturalness).toBe(7.0);
    expect(result?.attitudeConsistency).toBe(9.0);
    expect(result?.rationale).toBe(
      "文体が一貫しており、技術的な話題に対する態度も適切。",
    );
  });

  it("コードブロック内のJSONをパースできる", () => {
    const response = `以下が評価結果です。

\`\`\`json
{
  "authenticity": 6.0,
  "styleNaturalness": 5.5,
  "attitudeConsistency": 7.0,
  "rationale": "やや不自然な点がある。"
}
\`\`\``;

    const result = parseEvaluateResponse(response);

    expect(result).not.toBeNull();
    expect(result?.authenticity).toBe(6.0);
    expect(result?.styleNaturalness).toBe(5.5);
    expect(result?.attitudeConsistency).toBe(7.0);
  });

  it("不正なJSONでnullを返す", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseEvaluateResponse("これはJSONではありません");
    expect(result).toBeNull();
  });

  it("必須フィールド欠落でnullを返す", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseEvaluateResponse(
      JSON.stringify({
        authenticity: 8.0,
        styleNaturalness: 7.0,
        // attitudeConsistency が欠落
        // rationale が欠落
      }),
    );
    expect(result).toBeNull();
  });
});

describe("evaluate", () => {
  beforeEach(() => {
    counter = 0;
    vi.restoreAllMocks();
  });

  it("Sonnetモデル・temperature 0.0でリクエストする", async () => {
    const generated = makeGeneratedText();
    const evalTweets = [makeTaggedTweet("tech")];
    const persona = makePersonaDocument();

    const backend = createMockBackend(() => ({
      content: makeValidEvaluationResponse(),
    }));

    await evaluate(generated, evalTweets, persona, backend);

    expect(backend.calls[0].model).toBe("sonnet");
    expect(backend.calls[0].options.temperature).toBe(0.0);
  });

  it("evaluationフィールドが設定されたGeneratedTextを返す", async () => {
    const generated = makeGeneratedText();
    const evalTweets = [makeTaggedTweet("tech")];
    const persona = makePersonaDocument();

    const backend = createMockBackend(() => ({
      content: makeValidEvaluationResponse(),
    }));

    const result = await evaluate(generated, evalTweets, persona, backend);

    expect(result.evaluation).not.toBeNull();
    expect(result.text).toBe(generated.text);
    expect(result.topic).toBe(generated.topic);
    expect(result.fewShotIds).toEqual(generated.fewShotIds);
    expect(result.modelUsed).toBe(generated.modelUsed);
  });

  it("evaluationにauthenticity, styleNaturalness, attitudeConsistency, rationaleが含まれる", async () => {
    const generated = makeGeneratedText();
    const evalTweets = [makeTaggedTweet("tech")];
    const persona = makePersonaDocument();

    const backend = createMockBackend(() => ({
      content: makeValidEvaluationResponse(),
    }));

    const result = await evaluate(generated, evalTweets, persona, backend);

    expect(result.evaluation).toHaveProperty("authenticity");
    expect(result.evaluation).toHaveProperty("styleNaturalness");
    expect(result.evaluation).toHaveProperty("attitudeConsistency");
    expect(result.evaluation).toHaveProperty("rationale");
  });

  it("入力のgeneratedTextを変更しない（イミュータブル）", async () => {
    const generated = makeGeneratedText();
    const originalEvaluation = generated.evaluation;
    const evalTweets = [makeTaggedTweet("tech")];
    const persona = makePersonaDocument();

    const backend = createMockBackend(() => ({
      content: makeValidEvaluationResponse(),
    }));

    const result = await evaluate(generated, evalTweets, persona, backend);

    expect(generated.evaluation).toBe(originalEvaluation);
    expect(result).not.toBe(generated);
  });

  it("バリデーション失敗時にリトライする（最大2回リトライ = 計3回）", async () => {
    const generated = makeGeneratedText();
    const evalTweets = [makeTaggedTweet("tech")];
    const persona = makePersonaDocument();

    let callCount = 0;
    const backend = createMockBackend(() => {
      callCount++;
      if (callCount <= 2) return { content: "invalid json" };
      return { content: makeValidEvaluationResponse() };
    });

    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await evaluate(generated, evalTweets, persona, backend);

    expect(backend.calls).toHaveLength(3);
    expect(result.evaluation).not.toBeNull();
  });

  it("全リトライ失敗でエラーをスローする", async () => {
    const generated = makeGeneratedText();
    const evalTweets = [makeTaggedTweet("tech")];
    const persona = makePersonaDocument();

    const backend = createMockBackend(() => ({ content: "invalid" }));

    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      evaluate(generated, evalTweets, persona, backend),
    ).rejects.toThrow("3回すべて失敗");

    expect(backend.calls).toHaveLength(3);
  });
});

describe("isPassingEvaluation", () => {
  it("authenticity >= 6.0 で合格（デフォルトしきい値）", () => {
    const evaluation = {
      authenticity: 6.0,
      styleNaturalness: 5.0,
      attitudeConsistency: 5.0,
      rationale: "テスト",
    };
    expect(isPassingEvaluation(evaluation)).toBe(true);
  });

  it("authenticity < 6.0 で不合格（デフォルトしきい値）", () => {
    const evaluation = {
      authenticity: 5.9,
      styleNaturalness: 9.0,
      attitudeConsistency: 9.0,
      rationale: "テスト",
    };
    expect(isPassingEvaluation(evaluation)).toBe(false);
  });

  it("カスタムしきい値で合格判定できる", () => {
    const evaluation = {
      authenticity: 7.0,
      styleNaturalness: 5.0,
      attitudeConsistency: 5.0,
      rationale: "テスト",
    };
    expect(isPassingEvaluation(evaluation, 7.0)).toBe(true);
    expect(isPassingEvaluation(evaluation, 7.5)).toBe(false);
  });
});
