import { describe, it, expect, vi } from "vitest";
import { ModelIdString } from "@groa/types";
import type { LlmBackend, LlmRequest, LlmResponse } from "./types.js";
import { CostTracker } from "./cost.js";
import { TokenTrackingBackend } from "./token-tracking-backend.js";

function createMockBackend(
  response: Partial<LlmResponse> = {},
): LlmBackend {
  return {
    complete: vi.fn().mockResolvedValue({
      content: "ok",
      inputTokens: 100,
      outputTokens: 50,
      modelUsed: ModelIdString("claude-sonnet-4-6-20250227"),
      cachedTokens: 20,
      costUsd: null,
      ...response,
    }),
    backendType: vi.fn().mockReturnValue("anthropic"),
    getWarnings: vi.fn().mockReturnValue(["warning1"]),
  };
}

function createRequest(
  overrides: Partial<LlmRequest> = {},
): LlmRequest {
  return {
    messages: [{ role: "user", content: "Hello" }],
    maxTokens: 1024,
    options: { temperature: 0, useCache: false, useBatch: false },
    ...overrides,
  };
}

describe("TokenTrackingBackend", () => {
  it("complete() を inner に委譲してレスポンスをそのまま返す", async () => {
    const inner = createMockBackend();
    const tracked = new TokenTrackingBackend(inner, "classify");
    const req = createRequest();

    const res = await tracked.complete(req);

    expect(inner.complete).toHaveBeenCalledWith(req);
    expect(res.content).toBe("ok");
    expect(res.inputTokens).toBe(100);
    expect(res.outputTokens).toBe(50);
  });

  it("backendType() を inner に委譲する", () => {
    const inner = createMockBackend();
    const tracked = new TokenTrackingBackend(inner, "classify");

    expect(tracked.backendType()).toBe("anthropic");
  });

  it("getWarnings() を inner に委譲する", () => {
    const inner = createMockBackend();
    const tracked = new TokenTrackingBackend(inner, "classify");

    expect(tracked.getWarnings()).toEqual(["warning1"]);
  });

  it("1回の complete() 後に getCostRecord() でトークンを取得できる", async () => {
    const inner = createMockBackend();
    const tracked = new TokenTrackingBackend(inner, "classify");

    await tracked.complete(createRequest());

    const record = tracked.getCostRecord();
    expect(record.inputTokens).toBe(100);
    expect(record.outputTokens).toBe(50);
    expect(record.cachedTokens).toBe(20);
    expect(record.model).toBe("claude-sonnet-4-6-20250227");
    expect(record.estimatedUsd).toBeGreaterThan(0);
  });

  it("複数回の complete() でトークンが累計される", async () => {
    const inner = createMockBackend();
    const tracked = new TokenTrackingBackend(inner, "classify");

    await tracked.complete(createRequest());
    await tracked.complete(createRequest());
    await tracked.complete(createRequest());

    const record = tracked.getCostRecord();
    expect(record.inputTokens).toBe(300);
    expect(record.outputTokens).toBe(150);
    expect(record.cachedTokens).toBe(60);
  });

  it("complete() 前の getCostRecord() はゼロ値を返す", () => {
    const inner = createMockBackend();
    const tracked = new TokenTrackingBackend(inner, "classify");

    const record = tracked.getCostRecord();
    expect(record.inputTokens).toBe(0);
    expect(record.outputTokens).toBe(0);
    expect(record.cachedTokens).toBe(0);
    expect(record.estimatedUsd).toBe(0);
  });

  it("inputTokens/outputTokens が null の場合は 0 として扱う", async () => {
    const inner = createMockBackend({
      inputTokens: null,
      outputTokens: null,
    });
    const tracked = new TokenTrackingBackend(inner, "classify");

    await tracked.complete(createRequest());

    const record = tracked.getCostRecord();
    expect(record.inputTokens).toBe(0);
    expect(record.outputTokens).toBe(0);
  });

  it("外部から CostTracker を注入できる", async () => {
    const tracker = new CostTracker();
    const inner = createMockBackend();
    const tracked = new TokenTrackingBackend(inner, "classify", tracker);

    await tracked.complete(createRequest());

    // 注入した tracker にも記録されている
    expect(tracker.getTotalCost()).toBeGreaterThan(0);
    expect(tracker.getSummary().steps).toHaveLength(1);
  });

  it("getDisplayCostUsd(): costUsd が null のとき推計コストを返す (anthropic/openrouter)", async () => {
    const inner = createMockBackend({ costUsd: null });
    const tracked = new TokenTrackingBackend(inner, "classify");

    await tracked.complete(createRequest());

    // プロバイダーがコストを返さない → 推計コスト（> 0）
    expect(tracked.getDisplayCostUsd()).toBeGreaterThan(0);
    expect(tracked.getDisplayCostUsd()).toBe(tracked.getCostRecord().estimatedUsd);
  });

  it("getDisplayCostUsd(): costUsd が 0 のときプロバイダー報告値 0 を返す (claude-code)", async () => {
    const inner = createMockBackend({ costUsd: 0 });
    const tracked = new TokenTrackingBackend(inner, "classify");

    await tracked.complete(createRequest());

    // プロバイダーがコスト $0 を報告 → 表示は $0
    expect(tracked.getDisplayCostUsd()).toBe(0);
    // 推計コストは > 0 だが、表示用には使われない
    expect(tracked.getCostRecord().estimatedUsd).toBeGreaterThan(0);
  });

  it("getDisplayCostUsd(): 複数回の costUsd が累計される", async () => {
    const inner = createMockBackend({ costUsd: 0.05 });
    const tracked = new TokenTrackingBackend(inner, "classify");

    await tracked.complete(createRequest());
    await tracked.complete(createRequest());

    expect(tracked.getDisplayCostUsd()).toBeCloseTo(0.10);
  });

  it("useBatch: true がリクエストから CostTracker に伝搬される", async () => {
    const tracker = new CostTracker();
    const inner = createMockBackend();
    const tracked = new TokenTrackingBackend(inner, "classify", tracker);

    await tracked.complete(
      createRequest({
        options: { temperature: 0, useCache: false, useBatch: true },
      }),
    );

    const record = tracked.getCostRecord();
    // Batch API のコスト（通常の 50%）
    const normalTracker = new CostTracker();
    normalTracker.record(
      "classify",
      ModelIdString("claude-sonnet-4-6-20250227"),
      100,
      50,
      20,
    );
    const normalStep = normalTracker.getSummary().steps[0];
    expect(normalStep).toBeDefined();
    const normalCost = normalStep?.cost.estimatedUsd ?? 0;
    expect(record.estimatedUsd).toBeLessThan(normalCost);
  });
});
