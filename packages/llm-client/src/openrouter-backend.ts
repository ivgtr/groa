import { ModelIdString } from "@groa/types";
import type { ResolvedStepConfig } from "@groa/config";
import type { LlmBackend, LlmRequest, LlmResponse } from "./types.js";
import { withRetry, RateLimitError } from "./retry.js";
import { ApiError } from "./errors.js";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 120_000;

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterRequestBody {
  model: string;
  messages: OpenRouterMessage[];
  max_tokens: number;
  temperature?: number;
}

interface OpenRouterResponseBody {
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** OpenRouter API バックエンド (OpenAI 互換 Chat Completions API) */
export class OpenRouterBackend implements LlmBackend {
  private readonly apiKey: string;
  private readonly modelId: string;

  constructor(config: ResolvedStepConfig) {
    if (!config.apiKey) {
      throw new Error(
        "OpenRouter APIキーが設定されていません。" +
          "環境変数 OPENROUTER_API_KEY を設定するか、" +
          "groa.config.json の apiKeys.openrouter にAPIキーを指定してください。",
      );
    }
    this.apiKey = config.apiKey;
    this.modelId = config.model;
  }

  backendType(): "openrouter" {
    return "openrouter";
  }

  getWarnings(): string[] {
    return [];
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    return withRetry(() => this.sendRequest(request), {
      maxRetries: 3,
      initialDelayMs: 1000,
      multiplier: 2,
    });
  }

  private async sendRequest(request: LlmRequest): Promise<LlmResponse> {
    const messages: OpenRouterMessage[] = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const body: OpenRouterRequestBody = {
      model: this.modelId,
      messages,
      max_tokens: request.maxTokens,
    };

    if (request.options.temperature !== undefined) {
      body.temperature = request.options.temperature;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      DEFAULT_TIMEOUT_MS,
    );

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const retryAfterMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : null;
        throw new RateLimitError(
          "OpenRouter APIのレート制限に達しました。自動的にリトライします。",
          retryAfterMs,
        );
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        const error = new ApiError(
          `OpenRouter API エラー (${response.status}): ${errorText}。` +
            `APIキーの有効性とリクエスト内容を確認してください。`,
          response.status,
        );
        if (response.status >= 400 && response.status < 500) {
          error.nonRetryable = true;
        }
        throw error;
      }

      const data = (await response.json()) as OpenRouterResponseBody;
      const content = data.choices[0]?.message.content ?? "";

      return {
        content,
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        modelUsed: ModelIdString(data.model),
        cachedTokens: 0,
        costUsd: null,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
