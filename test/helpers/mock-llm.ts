/**
 * LLM レスポンスのモックヘルパー。
 * LLM利用パッケージ（classify, analyze, synthesize, generate, evaluate）の
 * テストで使用するモック LlmBackend を提供する。
 */
import type {
  LlmBackend,
  LlmRequest,
  LlmResponse,
} from "@groa/llm-client";
import { ModelIdString } from "@groa/types";

/**
 * 固定レスポンスを返すモック LlmBackend を作成する。
 * @param response 返却するレスポンスまたはレスポンス生成関数
 */
export function createMockBackend(
  response:
    | Partial<LlmResponse>
    | ((request: LlmRequest) => Partial<LlmResponse>),
): LlmBackend & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];

  const defaultResponse: LlmResponse = {
    content: "",
    inputTokens: 100,
    outputTokens: 50,
    modelUsed: ModelIdString("claude-sonnet-4-6-20250227"),
    cachedTokens: 0,
    costUsd: 0.002,
  };

  return {
    calls,
    backendType: () => "api" as const,
    complete: async (request: LlmRequest): Promise<LlmResponse> => {
      calls.push(request);
      const partial =
        typeof response === "function" ? response(request) : response;
      return { ...defaultResponse, ...partial };
    },
  };
}

/**
 * JSON文字列を返すモック LlmBackend を作成する。
 * LLMにJSON出力を期待するステップのテストに使用する。
 * @param jsonData 返却するJSONオブジェクト（文字列に変換される）
 */
export function createJsonMockBackend(
  jsonData: unknown | ((request: LlmRequest) => unknown),
): LlmBackend & { calls: LlmRequest[] } {
  return createMockBackend((request) => {
    const data =
      typeof jsonData === "function" ? jsonData(request) : jsonData;
    return { content: JSON.stringify(data) };
  });
}

/**
 * エラーを返すモック LlmBackend を作成する。
 */
export function createErrorMockBackend(
  error: Error,
): LlmBackend & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];

  return {
    calls,
    backendType: () => "api" as const,
    complete: async (request: LlmRequest): Promise<LlmResponse> => {
      calls.push(request);
      throw error;
    },
  };
}

/**
 * 順番に異なるレスポンスを返すモック LlmBackend を作成する。
 * リトライテストなどで使用する。
 */
export function createSequentialMockBackend(
  responses: (Partial<LlmResponse> | Error)[],
): LlmBackend & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  let callIndex = 0;

  const defaultResponse: LlmResponse = {
    content: "",
    inputTokens: 100,
    outputTokens: 50,
    modelUsed: ModelIdString("claude-sonnet-4-6-20250227"),
    cachedTokens: 0,
    costUsd: 0.002,
  };

  return {
    calls,
    backendType: () => "api" as const,
    complete: async (request: LlmRequest): Promise<LlmResponse> => {
      calls.push(request);
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;

      if (response instanceof Error) {
        throw response;
      }
      return { ...defaultResponse, ...response };
    },
  };
}
