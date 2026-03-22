import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ModelIdString } from "@groa/types";
import type { ResolvedStepConfig } from "@groa/config";
import { OpenRouterBackend } from "./openrouter-backend.js";
import type { LlmRequest } from "./types.js";

function createConfig(
  overrides: Partial<ResolvedStepConfig> = {},
): ResolvedStepConfig {
  return {
    backend: "openrouter",
    apiKey: "sk-or-test-key-12345678",
    model: ModelIdString("google/gemini-2.5-flash-lite"),
    params: {},
    ...overrides,
  };
}

function createRequest(
  overrides: Partial<LlmRequest> = {},
): LlmRequest {
  return {
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello" },
    ],
    maxTokens: 1024,
    options: { temperature: 0.0, useCache: false, useBatch: false },
    ...overrides,
  };
}

function mockFetchResponse(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = {},
) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function createSuccessResponse(content = "Hello back!") {
  return {
    choices: [
      {
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    model: "google/gemini-2.5-flash-lite",
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
  };
}

describe("OpenRouterBackend", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("APIキーなしで作成するとエラー", () => {
    expect(
      () => new OpenRouterBackend(createConfig({ apiKey: null })),
    ).toThrow("OpenRouter APIキーが設定されていません");
  });

  it("正常なリクエストを送信してレスポンスを受信する", async () => {
    globalThis.fetch = mockFetchResponse(
      createSuccessResponse(),
    ) as unknown as typeof fetch;

    const backend = new OpenRouterBackend(createConfig());
    const response = await backend.complete(createRequest());

    expect(response.content).toBe("Hello back!");
    expect(response.inputTokens).toBe(100);
    expect(response.outputTokens).toBe(50);
    expect(response.modelUsed).toBe("google/gemini-2.5-flash-lite");
    expect(response.cachedTokens).toBe(0);
  });

  it("system ロールを messages 配列に含めて送信する", async () => {
    const fetchMock = mockFetchResponse(createSuccessResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const backend = new OpenRouterBackend(createConfig());
    await backend.complete(createRequest());

    const callBody = JSON.parse(
      fetchMock.mock.calls[0][1].body as string,
    ) as Record<string, unknown>;

    // OpenAI互換: system は messages 配列に含まれる（Anthropic のように分離しない）
    const messages = callBody.messages as Array<Record<string, string>>;
    expect(messages[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant.",
    });
    expect(messages[1]).toEqual({
      role: "user",
      content: "Hello",
    });
  });

  it("Authorization: Bearer ヘッダーを使用する", async () => {
    const fetchMock = mockFetchResponse(createSuccessResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const backend = new OpenRouterBackend(createConfig());
    await backend.complete(createRequest());

    const callHeaders = fetchMock.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(callHeaders["Authorization"]).toBe(
      "Bearer sk-or-test-key-12345678",
    );
  });

  it("temperature を正しく設定する", async () => {
    const fetchMock = mockFetchResponse(createSuccessResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const backend = new OpenRouterBackend(createConfig());
    await backend.complete(
      createRequest({
        options: { temperature: 0.7, useCache: false, useBatch: false },
      }),
    );

    const callBody = JSON.parse(
      fetchMock.mock.calls[0][1].body as string,
    ) as Record<string, unknown>;
    expect(callBody.temperature).toBe(0.7);
  });

  it("モデルIDをリクエストボディに含める", async () => {
    const fetchMock = mockFetchResponse(createSuccessResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const backend = new OpenRouterBackend(createConfig());
    await backend.complete(createRequest());

    const callBody = JSON.parse(
      fetchMock.mock.calls[0][1].body as string,
    ) as Record<string, unknown>;
    expect(callBody.model).toBe("google/gemini-2.5-flash-lite");
  });

  it("API エラー時に適切なエラーメッセージを返す", async () => {
    globalThis.fetch = mockFetchResponse(
      { error: { message: "Invalid API key" } },
      401,
    ) as unknown as typeof fetch;

    const backend = new OpenRouterBackend(createConfig());
    await expect(backend.complete(createRequest())).rejects.toThrow(
      "OpenRouter API エラー (401)",
    );
  });

  it("backendType() は 'openrouter' を返す", () => {
    const backend = new OpenRouterBackend(createConfig());
    expect(backend.backendType()).toBe("openrouter");
  });
});
