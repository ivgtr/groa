/** ステップ単位のトークン使用量 */
export interface StepTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** パイプラインの進捗イベント */
export type StepEvent =
  | {
      type: "step-start";
      stepName: string;
      stepIndex: number;
      totalSteps: number;
    }
  | {
      type: "step-progress";
      stepName: string;
      detail: string;
    }
  | {
      type: "step-warning";
      stepName: string;
      message: string;
    }
  | {
      type: "step-complete";
      stepName: string;
      stepIndex: number;
      totalSteps: number;
      costUsd: number;
      totalCostUsd: number;
      tokenUsage?: StepTokenUsage;
      totalTokenUsage?: StepTokenUsage;
    }
  | {
      type: "pipeline-complete";
      totalCostUsd: number;
      totalTokenUsage?: StepTokenUsage;
    }
  | {
      type: "cost-limit-exceeded";
      currentCostUsd: number;
      limitUsd: number;
    };

/** 進捗イベントを受け取るコールバック */
export type ProgressCallback = (event: StepEvent) => void;

/** コスト上限超過エラー */
export class CostLimitExceededError extends Error {
  readonly code = "COST_LIMIT_EXCEEDED" as const;

  constructor(
    public readonly currentCostUsd: number,
    public readonly limitUsd: number,
  ) {
    super(
      `コスト上限に達しました: $${currentCostUsd.toFixed(2)} / $${limitUsd.toFixed(2)}。` +
        `--no-cost-limit で上限なしの実行が可能です。`,
    );
    this.name = "CostLimitExceededError";
  }
}

/**
 * コスト上限ガード。
 * 各ステップ完了時にコストを加算し、上限超過時にエラーをスローする。
 */
export class CostLimitGuard {
  private totalCostUsd = 0;

  /**
   * @param limitUsd コスト上限（USD）。null で無制限（--no-cost-limit）。
   */
  constructor(private readonly limitUsd: number | null) {}

  /** ステップのコストを加算する */
  addCost(costUsd: number): void {
    this.totalCostUsd += costUsd;
  }

  /** 累計コストを取得する */
  getTotalCost(): number {
    return this.totalCostUsd;
  }

  /** コスト上限を超過していればエラーをスローする */
  check(): void {
    if (this.limitUsd === null) return;

    if (this.totalCostUsd > this.limitUsd) {
      throw new CostLimitExceededError(this.totalCostUsd, this.limitUsd);
    }
  }
}

/**
 * パイプラインの進捗を追跡し、コールバックで通知する。
 * CLI/Web でアダプタを切り替えられるよう、コールバックベースの設計。
 */
export class PipelineProgress {
  private readonly costGuard: CostLimitGuard;
  private readonly onProgress: ProgressCallback;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

  constructor(options: {
    onProgress?: ProgressCallback;
    costLimitUsd?: number | null;
  }) {
    this.onProgress = options.onProgress ?? (() => {});
    this.costGuard = new CostLimitGuard(
      options.costLimitUsd === undefined ? 10.0 : options.costLimitUsd,
    );
  }

  /** ステップ開始を通知 */
  stepStart(
    stepName: string,
    stepIndex: number,
    totalSteps: number,
  ): void {
    this.onProgress({
      type: "step-start",
      stepName,
      stepIndex,
      totalSteps,
    });
  }

  /** ステップの進行状況を通知 */
  stepProgress(stepName: string, detail: string): void {
    this.onProgress({ type: "step-progress", stepName, detail });
  }

  /** ステップの警告を通知 */
  stepWarning(stepName: string, message: string): void {
    this.onProgress({ type: "step-warning", stepName, message });
  }

  /** ステップ完了を通知し、コスト上限をチェック */
  stepComplete(
    stepName: string,
    stepIndex: number,
    totalSteps: number,
    costUsd: number,
    tokenUsage?: StepTokenUsage,
  ): void {
    this.costGuard.addCost(costUsd);

    if (tokenUsage) {
      this.totalInputTokens += tokenUsage.inputTokens;
      this.totalOutputTokens += tokenUsage.outputTokens;
    }

    const totalCostUsd = this.costGuard.getTotalCost();

    this.onProgress({
      type: "step-complete",
      stepName,
      stepIndex,
      totalSteps,
      costUsd,
      totalCostUsd,
      tokenUsage,
      totalTokenUsage: {
        inputTokens: this.totalInputTokens,
        outputTokens: this.totalOutputTokens,
      },
    });

    // コスト上限チェック（超過時は次のステップ開始前にエラー）
    try {
      this.costGuard.check();
    } catch (error) {
      if (error instanceof CostLimitExceededError) {
        this.onProgress({
          type: "cost-limit-exceeded",
          currentCostUsd: error.currentCostUsd,
          limitUsd: error.limitUsd,
        });
      }
      throw error;
    }
  }

  /** パイプライン完了を通知 */
  pipelineComplete(): void {
    this.onProgress({
      type: "pipeline-complete",
      totalCostUsd: this.costGuard.getTotalCost(),
      totalTokenUsage: {
        inputTokens: this.totalInputTokens,
        outputTokens: this.totalOutputTokens,
      },
    });
  }

  /** 累計コストを取得 */
  getTotalCost(): number {
    return this.costGuard.getTotalCost();
  }
}
