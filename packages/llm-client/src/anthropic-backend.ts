import { ModelIdString } from "@groa/types";
import type { ResolvedStepConfig } from "@groa/config";
import type { LlmBackend, LlmRequest, LlmResponse } from "./types.js";
import { withRetry, RateLimitError } from "./retry.js";

import { ApiError } from "./errors.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 120_000;

/** APIキーをマスクする（先頭6文字以外を * に置換） */
export function maskApiKey(key: string): string {
  if (key.length <= 6) return "***";
  return key.slice(0, 6) + "*".repeat(key.length - 6);
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface CacheControl {
  type: "ephemeral";
}

interface SystemContentBlock {
  type: "text";
  text: string;
  cache_control?: CacheControl;
}

interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string | SystemContentBlock[];
  temperature?: number;
}

interface AnthropicResponseBody {
  content: Array<{ type: string; text: string }>;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/** Anthropic Messages API バックエンド */
export class AnthropicBackend implements LlmBackend {
  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly isBrowser: boolean;

  constructor(config: ResolvedStepConfig, isBrowser = false) {
    if (!config.apiKey) {
      throw new Error(
        "APIキーが設定されていません。" +
          "環境変数 ANTHROPIC_API_KEY を設定するか、" +
          "groa.config.json の apiKeys.anthropic にAPIキーを指定してください。",
      );
    }
    this.apiKey = config.apiKey;
    this.modelId = config.model;
    this.isBrowser = isBrowser;
  }

  backendType(): "anthropic" {
    return "anthropic";
  }

  getWarnings(): string[] {
    return [];
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    return withRetry(
      () => this.sendRequest(request),
      { maxRetries: 3, initialDelayMs: 1000, multiplier: 2 },
    );
  }

  private async sendRequest(request: LlmRequest): Promise<LlmResponse> {
    const systemMessage = request.messages.find((m) => m.role === "system");
    const nonSystemMessages = request.messages.filter(
      (m) => m.role !== "system",
    );

    const body: AnthropicRequestBody = {
      model: this.modelId,
      max_tokens: request.maxTokens,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    };

    if (systemMessage) {
      if (request.options.useCache) {
        body.system = [
          {
            type: "text",
            text: systemMessage.content,
            cache_control: { type: "ephemeral" },
          },
        ];
      } else {
        body.system = systemMessage.content;
      }
    }

    if (request.options.temperature !== undefined) {
      body.temperature = request.options.temperature;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    };

    if (this.isBrowser) {
      headers["anthropic-dangerous-direct-browser-access"] = "true";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      DEFAULT_TIMEOUT_MS,
    );

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
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
          "Anthropic APIのレート制限に達しました。自動的にリトライします。",
          retryAfterMs,
        );
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        const error = new ApiError(
          `Anthropic API エラー (${response.status}): ${errorText}。` +
            `APIキーの有効性とリクエスト内容を確認してください。`,
          response.status,
        );
        // 4xx (429除く) はリトライ不要なクライアントエラー
        if (response.status >= 400 && response.status < 500) {
          error.nonRetryable = true;
        }
        throw error;
      }

      const data = (await response.json()) as AnthropicResponseBody;

      const textContent = data.content.find((c) => c.type === "text");
      const content = textContent?.text ?? "";

      const cachedTokens =
        (data.usage.cache_read_input_tokens ?? 0) +
        (data.usage.cache_creation_input_tokens ?? 0);

      return {
        content,
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        modelUsed: ModelIdString(data.model),
        cachedTokens,
        costUsd: null, // CostTracker で別途計算
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
