import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModelIdString } from "@groa/types";
import type { LlmBackend, LlmResponse } from "@groa/llm-client";
import type { Embedder } from "@groa/embed";
import { resetCounter, makePersonaContext } from "./test-helpers.js";
import { runSession } from "./session-runner.js";

// --- session-runner 固有のヘルパー ---

type BackendType = "anthropic" | "openrouter" | "claude-code";

function createMockBackend(responseText: string = "生成されたテキスト"): LlmBackend {
  return {
    complete: vi.fn().mockResolvedValue({
      content: responseText,
      inputTokens: 100,
      outputTokens: 50,
      modelUsed: ModelIdString("test-model"),
      cachedTokens: 0,
      costUsd: 0.01,
    } satisfies LlmResponse),
    backendType: () => "anthropic" as BackendType,
    getWarnings: () => [],
  };
}

function createMockEmbedder(): Embedder {
  const queryVector = new Float32Array(384).fill(0.5);
  return {
    embed: vi.fn().mockResolvedValue([queryVector]),
    embedQuery: vi.fn().mockResolvedValue(queryVector),
  };
}

beforeEach(() => { resetCounter(); });

// --- テスト ---

describe("runSession - tweetモード", () => {
  it("1ターンのセッションを返す", async () => {
    const context = makePersonaContext();
    const backend = createMockBackend();
    const embedder = createMockEmbedder();

    const session = await runSession(
      [context],
      backend,
      embedder,
      { mode: "tweet", topic: "AIの未来" },
    );

    expect(session.mode).toBe("tweet");
    expect(session.topic).toBe("AIの未来");
    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.speakerId).toBe("alice");
    expect(session.turns[0]!.text).toBe("生成されたテキスト");
    expect(session.participants).toHaveLength(1);
    expect(session.participants[0]!.buildName).toBe("alice");
    expect(session.completedAt).not.toBeNull();
    expect(session.evaluation).toBeNull();
  });

  it("onTurnComplete コールバックが呼ばれる", async () => {
    const context = makePersonaContext();
    const backend = createMockBackend();
    const embedder = createMockEmbedder();
    const onTurnComplete = vi.fn();

    await runSession(
      [context],
      backend,
      embedder,
      { mode: "tweet", topic: "AI" },
      { onTurnComplete },
    );

    expect(onTurnComplete).toHaveBeenCalledTimes(1);
    expect(onTurnComplete.mock.calls[0]![0].text).toBe("生成されたテキスト");
  });

  it("セッションIDが正しい形式を持つ", async () => {
    const context = makePersonaContext();
    const backend = createMockBackend();
    const embedder = createMockEmbedder();

    const session = await runSession(
      [context],
      backend,
      embedder,
      { mode: "tweet", topic: "AI" },
    );

    expect(session.id).toMatch(/^tweet-\d{8}-[0-9a-f]{6}$/);
  });
});

describe("runSession - converseモード", () => {
  it("maxTurns指定で複数ターンを生成する", async () => {
    const context = makePersonaContext();
    let callCount = 0;
    const backend: LlmBackend = {
      complete: vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          content: `ターン${callCount}の発言`,
          inputTokens: 100,
          outputTokens: 50,
          modelUsed: ModelIdString("test-model"),
          cachedTokens: 0,
          costUsd: 0.01,
        } satisfies LlmResponse;
      }),
      backendType: () => "anthropic" as BackendType,
      getWarnings: () => [],
    };
    const embedder = createMockEmbedder();

    const session = await runSession(
      [context],
      backend,
      embedder,
      { mode: "converse", topic: "AI", maxTurns: 3 },
    );

    expect(session.mode).toBe("converse");
    expect(session.turns).toHaveLength(3);
    expect(session.turns[0]!.text).toBe("ターン1の発言");
    expect(session.turns[2]!.text).toBe("ターン3の発言");
  });

  it("maxTurns未指定かつshouldContinueがfalseを返したら終了する", async () => {
    const context = makePersonaContext();
    let callCount = 0;
    const backend: LlmBackend = {
      complete: vi.fn().mockImplementation(async (req: { messages: Array<{ role: string; content: string }>; maxTokens: number; options: { temperature: number } }) => {
        callCount++;
        // temperature === 0 のリクエストは shouldContinue への呼び出し
        if (req.options.temperature === 0) {
          return {
            content: JSON.stringify({ shouldContinue: false }),
            inputTokens: 50,
            outputTokens: 20,
            modelUsed: ModelIdString("test-model"),
            cachedTokens: 0,
            costUsd: 0.001,
          } satisfies LlmResponse;
        }
        return {
          content: `ターン${callCount}の発言`,
          inputTokens: 100,
          outputTokens: 50,
          modelUsed: ModelIdString("test-model"),
          cachedTokens: 0,
          costUsd: 0.01,
        } satisfies LlmResponse;
      }),
      backendType: () => "anthropic" as BackendType,
      getWarnings: () => [],
    };
    const embedder = createMockEmbedder();

    const session = await runSession(
      [context],
      backend,
      embedder,
      { mode: "converse", topic: "AI" },
    );

    expect(session.mode).toBe("converse");
    // shouldContinue が false を返すので1ターンで終了する
    expect(session.turns).toHaveLength(1);
    expect(session.completedAt).not.toBeNull();
    // 1ターン生成(temp=0.7) + shouldContinue(temp=0) = 2回呼ばれる
    expect(backend.complete).toHaveBeenCalledTimes(2);
  });
});

describe("runSession - multiモード", () => {
  it("ラウンドロビンで話者が切り替わる", async () => {
    const alice = makePersonaContext("alice");
    const bob = makePersonaContext("bob");

    const backend = createMockBackend("対話の発言");
    const embedder = createMockEmbedder();

    const session = await runSession(
      [alice, bob],
      backend,
      embedder,
      { mode: "multi", topic: "AI", maxTurns: 4 },
    );

    expect(session.turns).toHaveLength(4);
    expect(session.turns[0]!.speakerId).toBe("alice");
    expect(session.turns[1]!.speakerId).toBe("bob");
    expect(session.turns[2]!.speakerId).toBe("alice");
    expect(session.turns[3]!.speakerId).toBe("bob");
    expect(session.participants).toHaveLength(2);
  });

  it("3人以上でラウンドロビンが正しく回る", async () => {
    const alice = makePersonaContext("alice");
    const bob = makePersonaContext("bob");
    const carol = makePersonaContext("carol");

    const backend = createMockBackend("対話の発言");
    const embedder = createMockEmbedder();

    const session = await runSession(
      [alice, bob, carol],
      backend,
      embedder,
      { mode: "multi", topic: "AI", maxTurns: 6 },
    );

    expect(session.turns).toHaveLength(6);
    expect(session.turns[0]!.speakerId).toBe("alice");
    expect(session.turns[1]!.speakerId).toBe("bob");
    expect(session.turns[2]!.speakerId).toBe("carol");
    expect(session.turns[3]!.speakerId).toBe("alice");
    expect(session.turns[4]!.speakerId).toBe("bob");
    expect(session.turns[5]!.speakerId).toBe("carol");
    expect(session.participants).toHaveLength(3);
  });

  it("contextsが1件の場合エラーをスローする", async () => {
    const context = makePersonaContext();
    const backend = createMockBackend();
    const embedder = createMockEmbedder();

    await expect(
      runSession(
        [context],
        backend,
        embedder,
        { mode: "multi", topic: "AI", maxTurns: 4 },
      ),
    ).rejects.toThrow("2つ以上のプロファイルが必要");
  });
});

describe("runSession - chatモード", () => {
  it("getUserInput で入力を受け取り、nullで終了する", async () => {
    const context = makePersonaContext();
    const backend = createMockBackend("AIの応答");
    const embedder = createMockEmbedder();
    const inputs = ["こんにちは", "AIについて教えて", null];
    let inputIndex = 0;

    const session = await runSession(
      [context],
      backend,
      embedder,
      { mode: "chat", topic: "雑談" },
      {
        getUserInput: async () => inputs[inputIndex++] ?? null,
      },
    );

    expect(session.mode).toBe("chat");
    // user入力2回 + AI応答2回 = 4ターン
    expect(session.turns).toHaveLength(4);
    expect(session.turns[0]!.speakerId).toBe("__user__");
    expect(session.turns[0]!.text).toBe("こんにちは");
    expect(session.turns[1]!.speakerId).toBe("alice");
    expect(session.turns[1]!.text).toBe("AIの応答");
    expect(session.turns[2]!.speakerId).toBe("__user__");
    expect(session.turns[3]!.speakerId).toBe("alice");
    expect(session.participants.some((p) => p.role === "human")).toBe(true);
  });

  it("getUserInput未提供時にエラーをスローする", async () => {
    const context = makePersonaContext();
    const backend = createMockBackend();
    const embedder = createMockEmbedder();

    await expect(
      runSession(
        [context],
        backend,
        embedder,
        { mode: "chat", topic: "雑談" },
      ),
    ).rejects.toThrow("getUserInput コールバックが必要");
  });
});

describe("generateTurn リトライ", () => {
  it("最初の2回が空文字列でも3回目に成功する", async () => {
    const context = makePersonaContext();
    let callCount = 0;
    const backend: LlmBackend = {
      complete: vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          content: callCount <= 2 ? "" : "成功したテキスト",
          inputTokens: 100,
          outputTokens: 50,
          modelUsed: ModelIdString("test-model"),
          cachedTokens: 0,
          costUsd: 0.01,
        } satisfies LlmResponse;
      }),
      backendType: () => "anthropic" as BackendType,
      getWarnings: () => [],
    };
    const embedder = createMockEmbedder();

    const session = await runSession(
      [context],
      backend,
      embedder,
      { mode: "tweet", topic: "AI" },
    );

    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.text).toBe("成功したテキスト");
    // complete は3回呼ばれる（2回失敗 + 1回成功）
    expect(backend.complete).toHaveBeenCalledTimes(3);
  });

  it("3回とも空文字列ならエラーをスローする", async () => {
    const context = makePersonaContext();
    const backend: LlmBackend = {
      complete: vi.fn().mockResolvedValue({
        content: "",
        inputTokens: 100,
        outputTokens: 50,
        modelUsed: ModelIdString("test-model"),
        cachedTokens: 0,
        costUsd: 0.01,
      } satisfies LlmResponse),
      backendType: () => "anthropic" as BackendType,
      getWarnings: () => [],
    };
    const embedder = createMockEmbedder();

    await expect(
      runSession(
        [context],
        backend,
        embedder,
        { mode: "tweet", topic: "AI" },
      ),
    ).rejects.toThrow("すべて失敗しました");
    // complete は3回呼ばれる（MAX_RETRIES + 1）
    expect(backend.complete).toHaveBeenCalledTimes(3);
  });
});
