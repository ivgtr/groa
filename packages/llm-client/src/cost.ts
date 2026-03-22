import type { ModelIdString } from "@groa/types";

// --- コスト記録 ---

export interface CostRecord {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  model: ModelIdString;
  estimatedUsd: number;
}

export interface PipelineCostSummary {
  steps: { stepName: string; cost: CostRecord }[];
  totalUsd: number;
}

// --- トークン単価テーブル (USD per 1M tokens) ---

interface TokenPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheWritePerMillion: number;
  cacheReadPerMillion: number;
  batchInputPerMillion: number;
  batchOutputPerMillion: number;
}

// 参考値。実際の価格はプロバイダの公式ページを確認すること。
// 未知のモデルIDは DEFAULT_PRICING（Sonnet相当）にフォールバックする。
const PRICING_TABLE: Record<string, TokenPricing> = {
  // Anthropic (direct API)
  "claude-haiku-4-5-20251001": {
    inputPerMillion: 0.80,
    outputPerMillion: 4.00,
    cacheWritePerMillion: 1.00,
    cacheReadPerMillion: 0.08,
    batchInputPerMillion: 0.40,
    batchOutputPerMillion: 2.00,
  },
  "claude-sonnet-4-6-20250227": {
    inputPerMillion: 3.00,
    outputPerMillion: 15.00,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.30,
    batchInputPerMillion: 1.50,
    batchOutputPerMillion: 7.50,
  },
  "claude-opus-4-6-20250313": {
    inputPerMillion: 15.00,
    outputPerMillion: 75.00,
    cacheWritePerMillion: 18.75,
    cacheReadPerMillion: 1.50,
    batchInputPerMillion: 7.50,
    batchOutputPerMillion: 37.50,
  },
  // Google (via OpenRouter)
  "google/gemini-2.5-flash-lite": {
    inputPerMillion: 0.10,
    outputPerMillion: 0.40,
    cacheWritePerMillion: 0,
    cacheReadPerMillion: 0.025,
    batchInputPerMillion: 0.10,
    batchOutputPerMillion: 0.40,
  },
};

// デフォルト単価（未知モデル用、sonnet 相当）
const DEFAULT_PRICING: TokenPricing = {
  inputPerMillion: 3.00,
  outputPerMillion: 15.00,
  cacheWritePerMillion: 3.75,
  cacheReadPerMillion: 0.30,
  batchInputPerMillion: 1.50,
  batchOutputPerMillion: 7.50,
};

function getPricing(model: string): TokenPricing {
  return PRICING_TABLE[model] ?? DEFAULT_PRICING;
}

/** 単一リクエストのコストを計算する */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
  options: { isBatch: boolean } = { isBatch: false },
): number {
  const pricing = getPricing(model);

  if (options.isBatch) {
    const inputCost = (inputTokens / 1_000_000) * pricing.batchInputPerMillion;
    const outputCost =
      (outputTokens / 1_000_000) * pricing.batchOutputPerMillion;
    return inputCost + outputCost;
  }

  // 通常リクエスト: キャッシュ分は cacheRead 単価、残りは通常 input 単価
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens);
  const inputCost =
    (nonCachedInput / 1_000_000) * pricing.inputPerMillion +
    (cachedTokens / 1_000_000) * pricing.cacheReadPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return inputCost + outputCost;
}

// --- CostTracker ---

export class CostTracker {
  private records: Map<string, CostRecord[]> = new Map();

  /** リクエストのコストを記録する */
  record(
    stepName: string,
    model: ModelIdString,
    inputTokens: number | null,
    outputTokens: number | null,
    cachedTokens: number,
    options: { isBatch: boolean } = { isBatch: false },
  ): CostRecord {
    const input = inputTokens ?? 0;
    const output = outputTokens ?? 0;
    const estimatedUsd = calculateCost(
      model,
      input,
      output,
      cachedTokens,
      options,
    );

    const record: CostRecord = {
      inputTokens: input,
      outputTokens: output,
      cachedTokens,
      model,
      estimatedUsd,
    };

    const records = this.records.get(stepName) ?? [];
    records.push(record);
    this.records.set(stepName, records);

    return record;
  }

  /** 累計コストを取得する (USD) */
  getTotalCost(): number {
    let total = 0;
    for (const records of this.records.values()) {
      for (const record of records) {
        total += record.estimatedUsd;
      }
    }
    return total;
  }

  /** 工程別コストサマリを取得する */
  getSummary(): PipelineCostSummary {
    const steps: PipelineCostSummary["steps"] = [];

    for (const [stepName, records] of this.records.entries()) {
      const aggregated: CostRecord = {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        model: records[0]?.model ?? ("unknown" as ModelIdString),
        estimatedUsd: 0,
      };
      for (const record of records) {
        aggregated.inputTokens += record.inputTokens;
        aggregated.outputTokens += record.outputTokens;
        aggregated.cachedTokens += record.cachedTokens;
        aggregated.estimatedUsd += record.estimatedUsd;
      }
      steps.push({ stepName, cost: aggregated });
    }

    return {
      steps,
      totalUsd: this.getTotalCost(),
    };
  }
}
