import { ModelIdString } from "@groa/types";
import type { BackendType } from "@groa/config";
import type { LlmBackend, LlmRequest, LlmResponse } from "./types.js";
import { CostTracker } from "./cost.js";
import type { CostRecord } from "./cost.js";

/**
 * LlmBackend デコレータ。
 * complete() 呼び出しごとに CostTracker へトークン・コストを記録する。
 * パイプラインのステップ単位でインスタンスを生成し、
 * ステップ完了後に getCostRecord() で集計結果を取得する。
 */
export class TokenTrackingBackend implements LlmBackend {
  private readonly tracker: CostTracker;
  private readonly stepName: string;
  /** プロバイダー報告の実コスト累計。null = プロバイダーがコストを提供していない */
  private providerCostUsd: number | null = null;

  constructor(
    private readonly inner: LlmBackend,
    stepName: string,
    tracker?: CostTracker,
  ) {
    this.stepName = stepName;
    this.tracker = tracker ?? new CostTracker();
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const res = await this.inner.complete(request);
    this.tracker.record(
      this.stepName,
      res.modelUsed,
      res.inputTokens,
      res.outputTokens,
      res.cachedTokens,
      { isBatch: request.options.useBatch },
    );
    // プロバイダーがコストを報告する場合（claude-code: 0、anthropic/openrouter: null）
    if (res.costUsd !== null) {
      this.providerCostUsd = (this.providerCostUsd ?? 0) + res.costUsd;
    }
    return res;
  }

  backendType(): BackendType {
    return this.inner.backendType();
  }

  getWarnings(): string[] {
    return this.inner.getWarnings();
  }

  /**
   * 表示用コストを取得する。
   * プロバイダーがコストを報告する場合（claude-code: $0）はその値を、
   * 報告しない場合（anthropic/openrouter）はトークン数からの推計値を返す。
   */
  getDisplayCostUsd(): number {
    if (this.providerCostUsd !== null) {
      return this.providerCostUsd;
    }
    return this.getCostRecord().estimatedUsd;
  }

  /** このステップの集計済み CostRecord を取得する */
  getCostRecord(): CostRecord {
    const summary = this.tracker.getSummary();
    const step = summary.steps.find((s) => s.stepName === this.stepName);
    return (
      step?.cost ?? {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        model: ModelIdString("unknown"),
        estimatedUsd: 0,
      }
    );
  }
}
