import { describe, it, expect, vi } from "vitest";
import type { SessionTurn } from "@groa/types";
import { Timestamp, ModelIdString } from "@groa/types";
import type { LlmBackend, LlmRequest, LlmResponse } from "@groa/llm-client";
import { shouldContinue } from "./continuation.js";

type BackendType = "anthropic" | "openrouter" | "claude-code";

function makeTurn(text: string, index: number): SessionTurn {
  return {
    index,
    speakerId: "alice",
    text,
    fewShotIds: [],
    modelUsed: ModelIdString("test-model"),
    timestamp: Timestamp(Date.now() + index),
  };
}

function createMockBackend(responseContent: string): LlmBackend {
  return {
    complete: vi.fn().mockResolvedValue({
      content: responseContent,
      inputTokens: 10,
      outputTokens: 5,
      modelUsed: ModelIdString("test-model"),
      cachedTokens: 0,
      costUsd: 0.001,
    } satisfies LlmResponse),
    backendType: () => "anthropic" as BackendType,
    getWarnings: () => [],
  };
}

function createErrorBackend(): LlmBackend {
  return {
    complete: vi.fn().mockRejectedValue(new Error("LLM error")),
    backendType: () => "anthropic" as BackendType,
    getWarnings: () => [],
  };
}

describe("shouldContinue", () => {
  const turns = [
    makeTurn("AIは面白い", 0),
    makeTurn("特にLLMが注目されている", 1),
  ];

  it("LLMが shouldContinue: true を返す場合は true", async () => {
    const backend = createMockBackend('{ "shouldContinue": true }');
    const result = await shouldContinue(turns, backend, {
      currentTurn: 2,
      autoTurnLimit: 8,
    });
    expect(result).toBe(true);
  });

  it("LLMが shouldContinue: false を返す場合は false", async () => {
    const backend = createMockBackend('{ "shouldContinue": false }');
    const result = await shouldContinue(turns, backend, {
      currentTurn: 2,
      autoTurnLimit: 8,
    });
    expect(result).toBe(false);
  });

  it("autoTurnLimit に達した場合は強制 false", async () => {
    const backend = createMockBackend('{ "shouldContinue": true }');
    const result = await shouldContinue(turns, backend, {
      currentTurn: 8,
      autoTurnLimit: 8,
    });
    expect(result).toBe(false);
    expect(backend.complete).not.toHaveBeenCalled();
  });

  it("JSONパース失敗時はフォールバックで true", async () => {
    const backend = createMockBackend("invalid json response");
    const result = await shouldContinue(turns, backend, {
      currentTurn: 2,
      autoTurnLimit: 8,
    });
    expect(result).toBe(true);
  });

  it("LLMエラー時はフォールバックで true", async () => {
    const backend = createErrorBackend();
    const result = await shouldContinue(turns, backend, {
      currentTurn: 2,
      autoTurnLimit: 8,
    });
    expect(result).toBe(true);
  });

  it("不正なJSONスキーマ時はフォールバックで true", async () => {
    const backend = createMockBackend('{ "result": "yes" }');
    const result = await shouldContinue(turns, backend, {
      currentTurn: 2,
      autoTurnLimit: 8,
    });
    expect(result).toBe(true);
  });

  it("空のターンリストでは false", async () => {
    const backend = createMockBackend('{ "shouldContinue": true }');
    const result = await shouldContinue([], backend, {
      currentTurn: 0,
      autoTurnLimit: 8,
    });
    expect(result).toBe(false);
  });

  it("temperature 0.0 でリクエストされる", async () => {
    const backend = createMockBackend('{ "shouldContinue": true }');
    await shouldContinue(turns, backend, {
      currentTurn: 2,
      autoTurnLimit: 8,
    });
    const call = (backend.complete as ReturnType<typeof vi.fn>).mock.calls[0]![0] as LlmRequest;
    expect(call.options.temperature).toBe(0);
  });
});
