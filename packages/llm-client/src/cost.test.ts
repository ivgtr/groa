import { describe, it, expect } from "vitest";
import { ModelIdString } from "@groa/types";
import { calculateCost, CostTracker } from "./cost.js";

describe("calculateCost", () => {
  it("Haiku の通常リクエストコストを計算する", () => {
    const cost = calculateCost(
      "claude-haiku-4-5-20251001",
      1000, // input
      500, // output
      0, // cached
    );
    // input: 1000/1M * 0.80 = 0.0008
    // output: 500/1M * 4.00 = 0.002
    expect(cost).toBeCloseTo(0.0028, 6);
  });

  it("Sonnet の通常リクエストコストを計算する", () => {
    const cost = calculateCost(
      "claude-sonnet-4-6-20250227",
      10000,
      2000,
      0,
    );
    // input: 10000/1M * 3.00 = 0.03
    // output: 2000/1M * 15.00 = 0.03
    expect(cost).toBeCloseTo(0.06, 6);
  });

  it("Batch API の50%割引を適用する", () => {
    const normalCost = calculateCost(
      "claude-haiku-4-5-20251001",
      10000,
      5000,
      0,
    );
    const batchCost = calculateCost(
      "claude-haiku-4-5-20251001",
      10000,
      5000,
      0,
      { isBatch: true },
    );
    expect(batchCost).toBeCloseTo(normalCost / 2, 6);
  });

  it("Prompt Caching の90%削減を反映する", () => {
    const noCacheCost = calculateCost(
      "claude-sonnet-4-6-20250227",
      10000,
      1000,
      0,
    );
    const cachedCost = calculateCost(
      "claude-sonnet-4-6-20250227",
      10000,
      1000,
      10000, // 全 input がキャッシュ
    );
    // cached input: 10000/1M * 0.30 = 0.003 (vs normal 0.03 → 90%削減)
    expect(cachedCost).toBeLessThan(noCacheCost);
    const inputReduction = 1 - cachedCost / noCacheCost;
    expect(inputReduction).toBeGreaterThan(0.5);
  });

  it("未知モデルにはデフォルト単価（Sonnet相当）を使用する", () => {
    const unknownCost = calculateCost("unknown-model", 10000, 2000, 0);
    const sonnetCost = calculateCost(
      "claude-sonnet-4-6-20250227",
      10000,
      2000,
      0,
    );
    expect(unknownCost).toBeCloseTo(sonnetCost, 6);
  });
});

describe("CostTracker", () => {
  it("コストを記録して累計を取得できる", () => {
    const tracker = new CostTracker();
    tracker.record(
      "classify",
      ModelIdString("claude-haiku-4-5-20251001"),
      1000,
      500,
      0,
    );
    tracker.record(
      "classify",
      ModelIdString("claude-haiku-4-5-20251001"),
      2000,
      1000,
      0,
    );
    expect(tracker.getTotalCost()).toBeGreaterThan(0);
  });

  it("工程別サマリを取得できる", () => {
    const tracker = new CostTracker();
    tracker.record(
      "classify",
      ModelIdString("claude-haiku-4-5-20251001"),
      1000,
      500,
      0,
    );
    tracker.record(
      "analyze",
      ModelIdString("claude-sonnet-4-6-20250227"),
      5000,
      2000,
      0,
    );
    const summary = tracker.getSummary();
    expect(summary.steps).toHaveLength(2);
    expect(summary.totalUsd).toBeGreaterThan(0);
    expect(summary.steps[0]?.stepName).toBe("classify");
    expect(summary.steps[1]?.stepName).toBe("analyze");
  });

  it("null トークン数を0として扱う", () => {
    const tracker = new CostTracker();
    const record = tracker.record(
      "classify",
      ModelIdString("claude-haiku-4-5-20251001"),
      null,
      null,
      0,
    );
    expect(record.inputTokens).toBe(0);
    expect(record.outputTokens).toBe(0);
    expect(record.estimatedUsd).toBe(0);
  });

  it("空の tracker は合計0を返す", () => {
    const tracker = new CostTracker();
    expect(tracker.getTotalCost()).toBe(0);
    expect(tracker.getSummary().steps).toHaveLength(0);
  });

  it("Batch API のコスト計算に対応する", () => {
    const tracker = new CostTracker();
    const normal = tracker.record(
      "classify-normal",
      ModelIdString("claude-haiku-4-5-20251001"),
      10000,
      5000,
      0,
    );
    const batch = tracker.record(
      "classify-batch",
      ModelIdString("claude-haiku-4-5-20251001"),
      10000,
      5000,
      0,
      { isBatch: true },
    );
    expect(batch.estimatedUsd).toBeCloseTo(normal.estimatedUsd / 2, 6);
  });
});
