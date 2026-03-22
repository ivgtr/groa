import type { ModelIdString } from "@groa/types";
import type { BackendType } from "@groa/config";

// --- LLM Request / Response ---

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RequestOptions {
  temperature: number;
  useCache: boolean;
  useBatch: boolean;
}

export interface LlmRequest {
  messages: Message[];
  maxTokens: number;
  options: RequestOptions;
}

export interface LlmResponse {
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
  modelUsed: ModelIdString;
  cachedTokens: number;
  costUsd: number | null;
}

// --- LLM Backend ---

export interface LlmBackend {
  complete(request: LlmRequest): Promise<LlmResponse>;
  backendType(): BackendType;
}

// --- Validation fallback callback ---

export type ValidationFallback<T> = (
  error: unknown,
  rawContent: string,
) => T | null;
