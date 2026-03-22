import type { EvaluationResult } from "@groa/types";
import { EvaluationResultSchema } from "@groa/types";

/**
 * LLMレスポンスから EvaluationResult をパースする。
 * バリデーション失敗時は null を返す。
 */
export function parseEvaluateResponse(
  content: string,
): EvaluationResult | null {
  const jsonContent = extractJson(content);

  try {
    const raw: unknown = JSON.parse(jsonContent);
    return EvaluationResultSchema.parse(raw);
  } catch (error) {
    console.warn(
      `品質評価レスポンスのパースに失敗: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

/** JSON文字列を抽出する（コードブロック対応） */
function extractJson(content: string): string {
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  const objectMatch = content.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0];

  return content.trim();
}
