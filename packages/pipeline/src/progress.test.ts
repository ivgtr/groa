import { describe, it, expect } from "vitest";
import {
  CostLimitGuard,
  CostLimitExceededError,
  PipelineProgress,
} from "./progress.js";
import type { StepEvent } from "./progress.js";

describe("CostLimitGuard", () => {
  it("コストを加算して累計を返す", () => {
    const guard = new CostLimitGuard(10.0);
    guard.addCost(2.0);
    guard.addCost(3.5);
    expect(guard.getTotalCost()).toBeCloseTo(5.5);
  });

  it("上限以下ではエラーを投げない", () => {
    const guard = new CostLimitGuard(10.0);
    guard.addCost(5.0);
    expect(() => guard.check()).not.toThrow();
  });

  it("上限超過時に CostLimitExceededError を投げる", () => {
    const guard = new CostLimitGuard(10.0);
    guard.addCost(10.01);
    expect(() => guard.check()).toThrow(CostLimitExceededError);
  });

  it("CostLimitExceededError にコスト情報が含まれる", () => {
    const guard = new CostLimitGuard(5.0);
    guard.addCost(5.5);
    try {
      guard.check();
      expect.unreachable("Should have thrown");
    } catch (error) {
      const e = error as CostLimitExceededError;
      expect(e.currentCostUsd).toBeCloseTo(5.5);
      expect(e.limitUsd).toBe(5.0);
      expect(e.code).toBe("COST_LIMIT_EXCEEDED");
    }
  });

  it("上限ちょうどではエラーを投げない", () => {
    const guard = new CostLimitGuard(10.0);
    guard.addCost(10.0);
    expect(() => guard.check()).not.toThrow();
  });

  it("limitUsd が null なら無制限（エラーを投げない）", () => {
    const guard = new CostLimitGuard(null);
    guard.addCost(999999.0);
    expect(() => guard.check()).not.toThrow();
  });

  it("--no-cost-limit は null で表現される", () => {
    const guard = new CostLimitGuard(null);
    guard.addCost(100.0);
    expect(guard.getTotalCost()).toBeCloseTo(100.0);
    expect(() => guard.check()).not.toThrow();
  });
});

describe("PipelineProgress", () => {
  it("stepStart でコールバックが呼ばれる", () => {
    const events: StepEvent[] = [];
    const progress = new PipelineProgress({
      onProgress: (e) => events.push(e),
    });

    progress.stepStart("preprocess", 0, 6);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "step-start",
      stepName: "preprocess",
      stepIndex: 0,
      totalSteps: 6,
    });
  });

  it("stepProgress でコールバックが呼ばれる", () => {
    const events: StepEvent[] = [];
    const progress = new PipelineProgress({
      onProgress: (e) => events.push(e),
    });

    progress.stepProgress("classify", "50/100 batches");

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "step-progress",
      stepName: "classify",
      detail: "50/100 batches",
    });
  });

  it("stepComplete でコスト付きコールバックが呼ばれる", () => {
    const events: StepEvent[] = [];
    const progress = new PipelineProgress({
      onProgress: (e) => events.push(e),
      costLimitUsd: 10.0,
    });

    progress.stepComplete("classify", 2, 6, 0.17);

    expect(events).toHaveLength(1);
    const event = events[0] as Extract<StepEvent, { type: "step-complete" }>;
    expect(event.type).toBe("step-complete");
    expect(event.costUsd).toBeCloseTo(0.17);
    expect(event.totalCostUsd).toBeCloseTo(0.17);
  });

  it("stepComplete で累計コストが更新される", () => {
    const progress = new PipelineProgress({ costLimitUsd: 10.0 });

    progress.stepComplete("classify", 2, 6, 0.17);
    progress.stepComplete("analyze", 3, 6, 1.50);

    expect(progress.getTotalCost()).toBeCloseTo(1.67);
  });

  it("コスト上限超過で CostLimitExceededError が投げられる", () => {
    const events: StepEvent[] = [];
    const progress = new PipelineProgress({
      onProgress: (e) => events.push(e),
      costLimitUsd: 1.0,
    });

    expect(() => {
      progress.stepComplete("analyze", 3, 6, 1.5);
    }).toThrow(CostLimitExceededError);

    // cost-limit-exceeded イベントも通知される
    expect(events.some((e) => e.type === "cost-limit-exceeded")).toBe(true);
  });

  it("コスト上限超過イベントに正しい金額が含まれる", () => {
    const events: StepEvent[] = [];
    const progress = new PipelineProgress({
      onProgress: (e) => events.push(e),
      costLimitUsd: 2.0,
    });

    progress.stepComplete("classify", 2, 6, 1.0);
    expect(() => {
      progress.stepComplete("analyze", 3, 6, 1.5);
    }).toThrow(CostLimitExceededError);

    const costEvent = events.find(
      (e) => e.type === "cost-limit-exceeded",
    ) as Extract<StepEvent, { type: "cost-limit-exceeded" }>;
    expect(costEvent.currentCostUsd).toBeCloseTo(2.5);
    expect(costEvent.limitUsd).toBe(2.0);
  });

  it("costLimitUsd を null にすると無制限", () => {
    const progress = new PipelineProgress({ costLimitUsd: null });

    expect(() => {
      progress.stepComplete("analyze", 3, 6, 100.0);
    }).not.toThrow();
  });

  it("pipelineComplete で合計コストが通知される", () => {
    const events: StepEvent[] = [];
    const progress = new PipelineProgress({
      onProgress: (e) => events.push(e),
      costLimitUsd: 10.0,
    });

    progress.stepComplete("classify", 2, 6, 0.17);
    progress.stepComplete("analyze", 3, 6, 1.50);
    progress.pipelineComplete();

    const completeEvent = events.find(
      (e) => e.type === "pipeline-complete",
    ) as Extract<StepEvent, { type: "pipeline-complete" }>;
    expect(completeEvent.totalCostUsd).toBeCloseTo(1.67);
  });

  it("onProgress 未指定でもエラーなく動作する", () => {
    const progress = new PipelineProgress({});

    expect(() => {
      progress.stepStart("preprocess", 0, 6);
      progress.stepComplete("preprocess", 0, 6, 0);
      progress.pipelineComplete();
    }).not.toThrow();
  });

  it("デフォルトの costLimitUsd は $10.0", () => {
    const progress = new PipelineProgress({});

    // $10.0 以下は OK
    progress.stepComplete("step1", 0, 1, 10.0);
    expect(() => progress.stepComplete("step2", 1, 2, 0)).not.toThrow();

    // $10.0 を超えるとエラー
    expect(() => {
      progress.stepComplete("step3", 2, 3, 0.01);
    }).toThrow(CostLimitExceededError);
  });
});
