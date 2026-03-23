import type { EvaluationResult } from "@groa/types";
import { EvaluationResultSchema } from "@groa/types";
import { parseLlmResponse } from "@groa/llm-client";

/**
 * LLMレスポンスから EvaluationResult をパースする。
 * バリデーション失敗時は null を返す。
 */
export function parseEvaluateResponse(
  content: string,
): EvaluationResult | null {
  try {
    return parseLlmResponse(content, EvaluationResultSchema);
  } catch (error) {
    console.warn(
      `品質評価レスポンスのパースに失敗: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

