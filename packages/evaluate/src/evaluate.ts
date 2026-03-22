import type {
  PersonaDocument,
  TaggedTweet,
  GeneratedText,
  EvaluationResult,
} from "@groa/types";
import type { LlmBackend, LlmRequest } from "@groa/llm-client";
import { buildEvaluatePrompt } from "./evaluate-prompt.js";
import { parseEvaluateResponse } from "./evaluate-parse.js";

const MAX_TOKENS = 2048;
const MAX_RETRIES = 2;
const DEFAULT_THRESHOLD = 6.0;

/**
 * 評価結果が合格基準を満たしているかを判定する。
 *
 * @param evaluation 評価結果
 * @param threshold 合格しきい値（デフォルト 6.0）
 * @returns authenticity >= threshold なら true
 */
export function isPassingEvaluation(
  evaluation: EvaluationResult,
  threshold: number = DEFAULT_THRESHOLD,
): boolean {
  return evaluation.authenticity >= threshold;
}

/**
 * 生成テキストの品質評価を実行する。
 *
 * @param generatedText 評価対象の生成テキスト
 * @param evaluationTweets 評価用の参照ツイート群
 * @param personaDocument ペルソナ文書
 * @param backend LLMバックエンド
 * @returns evaluation フィールドが設定された新しい GeneratedText
 * @throws 全リトライ失敗時にエラー
 */
export async function evaluate(
  generatedText: GeneratedText,
  evaluationTweets: TaggedTweet[],
  personaDocument: PersonaDocument,
  backend: LlmBackend,
): Promise<GeneratedText> {
  const { system, user } = buildEvaluatePrompt(
    generatedText,
    evaluationTweets,
    personaDocument,
  );

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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await backend.complete(request);
    const result = parseEvaluateResponse(response.content);

    if (result) {
      return { ...generatedText, evaluation: result };
    }

    if (attempt < MAX_RETRIES) {
      console.warn(
        `品質評価のバリデーション失敗（${attempt + 1}/${MAX_RETRIES + 1}回目）。リトライします。`,
      );
    }
  }

  throw new Error(
    `品質評価が${MAX_RETRIES + 1}回すべて失敗しました。LLMの応答形式を確認してください。`,
  );
}
