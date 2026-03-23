import { describe, it, expect, vi } from "vitest";
import type {
  Session,
  PersonaDocument,
  TaggedTweet,
  Category,
  VoiceBankEntry,
} from "@groa/types";
import { TweetId, Timestamp, ModelIdString } from "@groa/types";
import type { LlmBackend, LlmResponse } from "@groa/llm-client";
import { evaluateSession } from "./evaluate-session.js";
import { buildSessionEvalPrompt } from "./evaluate-session-prompt.js";

// --- テストヘルパー ---

let counter = 0;

function makeTaggedTweet(category: Category): TaggedTweet {
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
    sentiment: "neutral",
    topics: [],
  };
}

function makePersonaDocument(): PersonaDocument {
  const voiceBank: VoiceBankEntry[] = [
    { tweet: makeTaggedTweet("tech"), selectionReason: "代表" },
    { tweet: makeTaggedTweet("daily"), selectionReason: "代表" },
  ];
  return {
    version: "1.0",
    createdAt: Timestamp(Date.now()),
    body: "テスト用ペルソナ",
    voiceBank,
    attitudePatterns: [],
    contradictions: [],
    sourceStats: {
      totalCount: 100,
      dateRange: { start: Timestamp(0), end: Timestamp(1) },
      filteredCount: 0,
    },
  };
}

function makeTweetSession(): Session {
  return {
    id: "tweet-20260323-abc123",
    mode: "tweet",
    topic: "AIの未来",
    participants: [{ buildName: "alice", role: "persona" }],
    turns: [
      {
        index: 0,
        speakerId: "alice",
        text: "AIは社会を変えていく",
        fewShotIds: [TweetId("t1")],
        modelUsed: ModelIdString("test-model"),
        timestamp: Timestamp(Date.now()),
      },
    ],
    evaluation: null,
    createdAt: Timestamp(Date.now()),
    completedAt: Timestamp(Date.now()),
  };
}

function makeConverseSession(): Session {
  return {
    id: "converse-20260323-abc123",
    mode: "converse",
    topic: "AIの未来",
    participants: [{ buildName: "alice", role: "persona" }],
    turns: [
      {
        index: 0,
        speakerId: "alice",
        text: "AIは面白い技術だ",
        fewShotIds: [],
        modelUsed: ModelIdString("test-model"),
        timestamp: Timestamp(Date.now()),
      },
      {
        index: 1,
        speakerId: "alice",
        text: "特にLLMの進歩が目覚ましい",
        fewShotIds: [],
        modelUsed: ModelIdString("test-model"),
        timestamp: Timestamp(Date.now() + 1),
      },
    ],
    evaluation: null,
    createdAt: Timestamp(Date.now()),
    completedAt: Timestamp(Date.now()),
  };
}

type BackendType = "anthropic" | "openrouter" | "claude-code";

function createMockBackend(responseJson: string): LlmBackend {
  return {
    complete: vi.fn().mockResolvedValue({
      content: responseJson,
      inputTokens: 200,
      outputTokens: 100,
      modelUsed: ModelIdString("test-model"),
      cachedTokens: 0,
      costUsd: 0.01,
    } satisfies LlmResponse),
    backendType: () => "anthropic" as BackendType,
    getWarnings: () => [],
  };
}

// --- テスト ---

describe("buildSessionEvalPrompt", () => {
  it("tweetモードのプロンプトに評価対象テキストが含まれる", () => {
    counter = 0;
    const session = makeTweetSession();
    const tweets = [makeTaggedTweet("tech"), makeTaggedTweet("daily")];
    const persona = makePersonaDocument();

    const { system, user } = buildSessionEvalPrompt(session, tweets, persona);

    expect(system).toContain("文体分析の専門家");
    expect(user).toContain("AIは社会を変えていく");
    expect(user).toContain("authenticity");
    expect(user).toContain("coherence");
    expect(user).toContain("consistency");
  });

  it("会話モードのプロンプトに会話全体が含まれる", () => {
    counter = 0;
    const session = makeConverseSession();
    const tweets = [makeTaggedTweet("tech")];
    const persona = makePersonaDocument();

    const { system, user } = buildSessionEvalPrompt(session, tweets, persona);

    expect(system).toContain("会話品質評価の専門家");
    expect(user).toContain("AIは面白い技術だ");
    expect(user).toContain("特にLLMの進歩が目覚ましい");
    expect(user).toContain("[alice]:");
  });
});

describe("evaluateSession", () => {
  it("正常なレスポンスからSessionEvaluationを返す", async () => {
    counter = 0;
    const session = makeTweetSession();
    const tweets = [makeTaggedTweet("tech")];
    const persona = makePersonaDocument();
    const backend = createMockBackend(
      JSON.stringify({
        authenticity: 8.5,
        coherence: 7.0,
        consistency: 8.0,
        rationale: "文体がよく一致している",
      }),
    );

    const result = await evaluateSession(session, tweets, persona, backend);

    expect(result.authenticity).toBe(8.5);
    expect(result.coherence).toBe(7.0);
    expect(result.consistency).toBe(8.0);
    expect(result.rationale).toBe("文体がよく一致している");
  });

  it("temperature 0.0でリクエストされる", async () => {
    counter = 0;
    const session = makeTweetSession();
    const tweets = [makeTaggedTweet("tech")];
    const persona = makePersonaDocument();
    const backend = createMockBackend(
      JSON.stringify({
        authenticity: 8.0,
        coherence: 7.0,
        consistency: 8.0,
        rationale: "OK",
      }),
    );

    await evaluateSession(session, tweets, persona, backend);

    const call = (backend.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.options.temperature).toBe(0.0);
  });

  it("パース失敗時はリトライし、全失敗でエラー", async () => {
    counter = 0;
    const session = makeTweetSession();
    const tweets = [makeTaggedTweet("tech")];
    const persona = makePersonaDocument();
    const backend = createMockBackend("invalid json");

    await expect(
      evaluateSession(session, tweets, persona, backend),
    ).rejects.toThrow("セッション評価が3回すべて失敗しました");

    expect(backend.complete).toHaveBeenCalledTimes(3);
  });
});
