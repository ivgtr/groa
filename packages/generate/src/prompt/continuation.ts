import type { SessionTurn } from "@groa/types";
import type { LlmBackend, LlmRequest } from "@groa/llm-client";

const MAX_TOKENS = 128;

const SYSTEM_PROMPT =
  "あなたは会話の流れを判断するアシスタントです。会話が自然に終了したかどうかを判断してください。JSONのみで回答してください。";

/**
 * 直近の会話ターンを踏まえ、会話を続けるべきかをLLMで判断する。
 *
 * @returns true なら続行、false なら終了
 */
export async function shouldContinue(
  turns: SessionTurn[],
  backend: LlmBackend,
  options: {
    currentTurn: number;
    autoTurnLimit: number;
  },
): Promise<boolean> {
  // 安全上限チェック
  if (options.currentTurn >= options.autoTurnLimit) {
    return false;
  }

  const lastTurn = turns[turns.length - 1];
  if (!lastTurn) {
    return false;
  }

  const recentContext = turns
    .slice(-3)
    .map((t) => t.text)
    .join("\n");

  const userMessage = `以下の会話の最後の発言を踏まえ、まだ話すべきことがあるか（会話が完結していないか）を判断してください。

## 直近の発言

${recentContext}

## 最終発言
"${lastTurn.text}"

JSON形式のみで回答してください: { "shouldContinue": true } または { "shouldContinue": false }`;

  const request: LlmRequest = {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    maxTokens: MAX_TOKENS,
    options: {
      temperature: 0,
      useCache: false,
      useBatch: false,
    },
  };

  try {
    const response = await backend.complete(request);
    const parsed: unknown = JSON.parse(response.content);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "shouldContinue" in parsed &&
      typeof (parsed as Record<string, unknown>).shouldContinue === "boolean"
    ) {
      return (parsed as { shouldContinue: boolean }).shouldContinue;
    }

    // JSON構造が不正な場合はフォールバック
    return true;
  } catch {
    // パース失敗・LLMエラー時はフォールバック（続行が安全）
    return true;
  }
}
