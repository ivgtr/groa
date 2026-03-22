import type {
  ClusterAnalysis,
  StyleStats,
  CorpusMetadata,
  PersonaDocument,
} from "@groa/types";
import type { LlmBackend, LlmRequest } from "@groa/llm-client";
import { selectVoiceBank } from "./voice-bank.js";
import { buildSynthesizePrompt } from "./synthesize-prompt.js";
import { parseSynthesizeResponse } from "./synthesize-parse.js";

const MAX_TOKENS = 16384;
const MAX_RETRIES = 2;

/**
 * ClusterAnalysis[] と StyleStats を統合し PersonaDocument を生成する。
 *
 * @param analyses クラスタ分析結果
 * @param styleStats 全体の文体統計
 * @param corpusMetadata コーパスのメタデータ
 * @param backend LLMバックエンド
 * @returns PersonaDocument
 * @throws 全リトライ失敗時にエラー
 */
export async function synthesize(
  analyses: ClusterAnalysis[],
  styleStats: StyleStats,
  corpusMetadata: CorpusMetadata,
  backend: LlmBackend,
): Promise<PersonaDocument> {
  const voiceBank = selectVoiceBank(analyses);
  const { system, user } = buildSynthesizePrompt(
    analyses,
    styleStats,
    voiceBank,
  );

  const request: LlmRequest = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: MAX_TOKENS,
    options: {
      temperature: 0.2,
      useCache: false,
      useBatch: false,
    },
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await backend.complete(request);
    const result = parseSynthesizeResponse(
      response.content,
      voiceBank,
      corpusMetadata,
    );

    if (result) return result;

    if (attempt < MAX_RETRIES) {
      console.warn(
        `ペルソナ合成のバリデーション失敗（${attempt + 1}/${MAX_RETRIES + 1}回目）。リトライします。`,
      );
    }
  }

  throw new Error(
    `ペルソナ合成が${MAX_RETRIES + 1}回すべて失敗しました。LLMの応答形式を確認してください。`,
  );
}
