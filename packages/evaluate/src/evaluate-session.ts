import type {
  Session,
  SessionEvaluation,
  PersonaDocument,
  TaggedTweet,
} from "@groa/types";
import { SessionEvaluationSchema } from "@groa/types";
import type { LlmBackend, LlmRequest } from "@groa/llm-client";
import { parseLlmResponse } from "@groa/llm-client";
import { buildSessionEvalPrompt } from "./evaluate-session-prompt.js";

const MAX_TOKENS = 2048;
const MAX_RETRIES = 2;

/**
 * SessionEvaluation をLLMレスポンスからパースする。
 * バリデーション失敗時は null を返す。
 */
function parseSessionEvalResponse(
  content: string,
): SessionEvaluation | null {
  try {
    return parseLlmResponse(content, SessionEvaluationSchema);
  } catch (error) {
    console.warn(
      `セッション評価レスポンスのパースに失敗: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

/**
 * セッション全体を1回のLLM呼び出しで評価する。
 *
 * @param session 評価対象のセッション
 * @param evaluationTweets 評価用の参照ツイート群
 * @param persona ペルソナ文書
 * @param backend LLMバックエンド
 * @returns SessionEvaluation
 * @throws 全リトライ失敗時にエラー
 */
export async function evaluateSession(
  session: Session,
  evaluationTweets: TaggedTweet[],
  persona: PersonaDocument,
  backend: LlmBackend,
): Promise<SessionEvaluation> {
  const { system, user } = buildSessionEvalPrompt(
    session,
    evaluationTweets,
    persona,
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
    const result = parseSessionEvalResponse(response.content);

    if (result) {
      return result;
    }

    if (attempt < MAX_RETRIES) {
      console.warn(
        `セッション評価のバリデーション失敗（${attempt + 1}/${MAX_RETRIES + 1}回目）。リトライします。`,
      );
    }
  }

  throw new Error(
    `セッション評価が${MAX_RETRIES + 1}回すべて失敗しました。LLMの応答形式を確認してください。`,
  );
}
