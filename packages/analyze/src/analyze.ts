import type { ClusterAnalysis } from "@groa/types";
import type { LlmBackend, LlmRequest } from "@groa/llm-client";
import type { ClusterWithStats } from "./cluster-stats.js";
import { buildAnalyzePrompt } from "./analyze-prompt.js";
import { parseAnalyzeResponse } from "./analyze-parse.js";

const MAX_TOKENS = 8192;

export interface AnalyzeOptions {
  onProgress?: (completed: number, total: number) => void;
}

/**
 * 各クラスタに対して Sonnet で人格特徴を抽出する。
 *
 * @param clustersWithStats クラスタと統計サブセットのペア
 * @param backend LLMバックエンド
 * @param options オプション
 * @returns バリデーション成功したクラスタ分析結果（失敗したクラスタはスキップ）
 */
export async function analyzeClusters(
  clustersWithStats: ClusterWithStats[],
  backend: LlmBackend,
  options: AnalyzeOptions = {},
): Promise<ClusterAnalysis[]> {
  const results: ClusterAnalysis[] = [];
  const total = clustersWithStats.length;

  for (let i = 0; i < total; i++) {
    const cws = clustersWithStats[i];
    const result = await analyzeCluster(cws, backend);

    if (result) {
      results.push(result);
    }

    options.onProgress?.(i + 1, total);
  }

  return results;
}

/**
 * 単一クラスタに対して LLM 分析を実行する。
 * バリデーション失敗時は null を返し、警告をログに出力する。
 */
export async function analyzeCluster(
  clusterWithStats: ClusterWithStats,
  backend: LlmBackend,
): Promise<ClusterAnalysis | null> {
  const { system, user } = buildAnalyzePrompt(clusterWithStats);

  const request: LlmRequest = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: MAX_TOKENS,
    options: {
      temperature: 0.0,
      useCache: false,
      useBatch: false,
    },
  };

  const response = await backend.complete(request);
  return parseAnalyzeResponse(response.content, clusterWithStats.cluster);
}
