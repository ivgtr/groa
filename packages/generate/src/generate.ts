import type {
  PersonaDocument,
  TaggedTweet,
  GeneratedText,
} from "@groa/types";
import type { LlmBackend, LlmRequest } from "@groa/llm-client";
import { buildGeneratePrompt } from "./generate-prompt.js";

const MAX_TOKENS = 2048;
const MAX_RETRIES = 2;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_LENGTH = 280;
const DEFAULT_NUM_VARIANTS = 1;

export interface GenerateParams {
  topic: string;
  temperature?: number;
  maxLength?: number;
  numVariants?: number;
  styleHint?: string | null;
}

/**
 * 生成されたテキストのバリデーション。
 * 空でないトリム済みテキストであることを確認する。
 */
function validateGeneratedText(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

/**
 * 1件のテキスト生成を実行する（リトライ付き）。
 */
async function generateSingle(
  personaDocument: PersonaDocument,
  fewShotTweets: TaggedTweet[],
  backend: LlmBackend,
  params: GenerateParams,
): Promise<GeneratedText> {
  const temperature = params.temperature ?? DEFAULT_TEMPERATURE;
  const maxLength = params.maxLength ?? DEFAULT_MAX_LENGTH;
  const styleHint = params.styleHint ?? null;

  const { system, user } = buildGeneratePrompt(
    personaDocument,
    params.topic,
    fewShotTweets,
    { maxLength, styleHint },
  );

  const request: LlmRequest = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: MAX_TOKENS,
    options: {
      temperature,
      useCache: backend.backendType() === "anthropic",
      useBatch: false,
    },
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await backend.complete(request);
    const validated = validateGeneratedText(response.content);

    if (validated !== null) {
      return {
        text: validated,
        topic: params.topic,
        evaluation: null,
        fewShotIds: fewShotTweets.map((t) => t.tweet.id),
        modelUsed: response.modelUsed,
      };
    }

    if (attempt < MAX_RETRIES) {
      console.warn(
        `テキスト生成のバリデーション失敗（${attempt + 1}/${MAX_RETRIES + 1}回目）。リトライします。`,
      );
    }
  }

  throw new Error(
    `テキスト生成が${MAX_RETRIES + 1}回すべて失敗しました。LLMの応答を確認してください。`,
  );
}

/**
 * PersonaDocument と Few-shot ツイートからテキストを生成する。
 *
 * @param personaDocument ペルソナ文書
 * @param fewShotTweets Step 6 の forGeneration 結果
 * @param backend LLM バックエンド
 * @param params 生成パラメータ
 * @returns numVariants === 1 の場合は GeneratedText、それ以外は GeneratedText[]
 */
export async function generate(
  personaDocument: PersonaDocument,
  fewShotTweets: TaggedTweet[],
  backend: LlmBackend,
  params: GenerateParams,
): Promise<GeneratedText | GeneratedText[]> {
  const numVariants = params.numVariants ?? DEFAULT_NUM_VARIANTS;

  if (numVariants === 1) {
    return generateSingle(personaDocument, fewShotTweets, backend, params);
  }

  const results: GeneratedText[] = [];
  for (let i = 0; i < numVariants; i++) {
    const result = await generateSingle(
      personaDocument,
      fewShotTweets,
      backend,
      params,
    );
    results.push(result);
  }

  return results;
}
