import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Session, PersonaDocument, TaggedTweet, EmbeddingIndex, Category, VoiceBankEntry } from "@groa/types";
import { TweetId, Timestamp, ModelIdString } from "@groa/types";
import type { GroaConfig } from "@groa/config";
import { createDefaultConfig } from "@groa/config";
import type { PersonaContext } from "@groa/generate";
import type { LlmResponse } from "@groa/llm-client";
import { SessionStore } from "./session-store.js";

// --- モック ---

vi.mock("@groa/embed", () => ({
  createEmbedder: vi.fn().mockResolvedValue({
    embed: vi.fn().mockResolvedValue([new Float32Array(384).fill(0.5)]),
    embedQuery: vi.fn().mockResolvedValue(new Float32Array(384).fill(0.5)),
  }),
}));

vi.mock("@groa/llm-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@groa/llm-client")>();
  const mockResponse: LlmResponse = {
    content: "生成されたテキスト",
    inputTokens: 100,
    outputTokens: 50,
    modelUsed: ModelIdString("test-model"),
    cachedTokens: 0,
    costUsd: 0.01,
  };

  return {
    ...original,
    createLlmBackend: vi.fn().mockReturnValue({
      complete: vi.fn().mockResolvedValue(mockResponse),
      backendType: () => "anthropic",
      getWarnings: () => [],
    }),
    TokenTrackingBackend: vi.fn().mockImplementation((_backend: unknown, _step: string) => ({
      complete: vi.fn().mockResolvedValue(mockResponse),
      backendType: () => "anthropic",
      getWarnings: () => [],
      getCostRecord: () => ({ inputTokens: 100, outputTokens: 50, costUsd: 0.01 }),
      getDisplayCostUsd: () => 0.01,
    })),
  };
});

vi.mock("@groa/evaluate", () => ({
  evaluateSession: vi.fn().mockResolvedValue({
    authenticity: 8.0,
    coherence: 7.5,
    consistency: 8.0,
    rationale: "テスト評価",
  }),
}));

// --- テストヘルパー ---

let counter = 0;
let tmpDir: string;

function makeTaggedTweet(category: Category): TaggedTweet {
  counter++;
  return {
    tweet: {
      id: TweetId(`t${counter}`),
      text: `テスト${counter}`,
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

function makeContext(): PersonaContext {
  const taggedTweets: TaggedTweet[] = [];
  for (let i = 0; i < 10; i++) taggedTweets.push(makeTaggedTweet("tech"));

  const voiceBank: VoiceBankEntry[] = [
    { tweet: makeTaggedTweet("tech"), selectionReason: "代表" },
  ];

  const embeddings = taggedTweets.map((t) => ({
    tweetId: t.tweet.id,
    vector: new Float32Array(384).fill(0.1),
    dimensions: 384,
  }));

  return {
    buildName: "alice",
    persona: {
      version: "1.0",
      createdAt: Timestamp(Date.now()),
      body: "テスト用ペルソナ",
      voiceBank,
      attitudePatterns: [],
      contradictions: [],
      sourceStats: { totalCount: 100, dateRange: { start: Timestamp(0), end: Timestamp(1) }, filteredCount: 0 },
    },
    taggedTweets,
    embeddingIndex: { embeddings, model: ModelIdString("test-model") },
  };
}

function makeConfig(cacheDir: string): GroaConfig {
  const config = createDefaultConfig();
  config.cacheDir = cacheDir;
  config.backend = "anthropic";
  config.models.standard = "test-sonnet";
  config.models.quick = "test-haiku";
  config.apiKeys.anthropic = "sk-test-key";
  return config;
}

beforeEach(async () => {
  counter = 0;
  tmpDir = await mkdtemp(join(tmpdir(), "groa-pipeline-session-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// --- テスト ---

describe("runSessionPipeline", () => {
  it("tweetモードでセッションを実行・評価・保存する", async () => {
    // dynamic import to apply mocks
    const { runSessionPipeline } = await import("./run-session.js");

    const config = makeConfig(tmpDir);
    const context = makeContext();

    const session = await runSessionPipeline(config, [context], {
      mode: "tweet",
      topic: "AIの未来",
    });

    expect(session.mode).toBe("tweet");
    expect(session.topic).toBe("AIの未来");
    expect(session.turns.length).toBeGreaterThanOrEqual(1);
    expect(session.evaluation).not.toBeNull();
    expect(session.completedAt).not.toBeNull();

    // ログが保存されていることを確認
    const store = new SessionStore(tmpDir);
    const saved = await store.load(session.id);
    expect(saved).not.toBeNull();
    expect(saved!.id).toBe(session.id);
  });

  it("chatモードではデフォルトで評価をスキップする", async () => {
    const { runSessionPipeline } = await import("./run-session.js");
    const evaluateMod = await import("@groa/evaluate");
    const evaluateSession = vi.mocked(evaluateMod.evaluateSession);
    evaluateSession.mockClear();

    const config = makeConfig(tmpDir);
    const context = makeContext();

    const session = await runSessionPipeline(config, [context], {
      mode: "chat",
      topic: "雑談",
    }, {
      callbacks: {
        getUserInput: vi.fn()
          .mockResolvedValueOnce("こんにちは")
          .mockResolvedValueOnce(null),
      },
    });

    expect(session.mode).toBe("chat");
    expect(session.evaluation).toBeNull();
    expect(evaluateSession).not.toHaveBeenCalled();
  });

  it("onProgressコールバックが呼ばれる", async () => {
    const { runSessionPipeline } = await import("./run-session.js");

    const config = makeConfig(tmpDir);
    const context = makeContext();
    const onProgress = vi.fn();

    await runSessionPipeline(config, [context], {
      mode: "tweet",
      topic: "AI",
    }, { onProgress });

    const eventTypes = onProgress.mock.calls.map(
      (call: unknown[]) => (call[0] as { type: string }).type,
    );
    expect(eventTypes).toContain("step-start");
    expect(eventTypes).toContain("step-complete");
    expect(eventTypes).toContain("pipeline-complete");
  });
});
