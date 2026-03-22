import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ModelIdString } from "@groa/types";
import type { ResolvedStepConfig } from "@groa/config";
import { AnthropicBackend, maskApiKey } from "./anthropic-backend.js";
import type { LlmRequest } from "./types.js";

function createConfig(
  overrides: Partial<ResolvedStepConfig> = {},
): ResolvedStepConfig {
  return {
    backend: "anthropic",
    apiKey: "sk-test-key-12345678",
    model: ModelIdString("claude-sonnet-4-6-20250227"),
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

describe("maskApiKey", () => {
  it("先頭6文字以外をマスクする", () => {
    const key = "sk-ant-api03-xxxxx";
    const masked = maskApiKey(key);
    expect(masked.slice(0, 6)).toBe("sk-ant");
    expect(masked.length).toBe(key.length);
    expect(masked.slice(6)).toMatch(/^\*+$/);
  });

  it("6文字以下の短いキーは全マスク", () => {
    expect(maskApiKey("short")).toBe("***");
  });
});

describe("AnthropicBackend", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("APIキーなしで作成するとエラー", () => {
    expect(
      () => new AnthropicBackend(createConfig({ apiKey: null })),
    ).toThrow("APIキーが設定されていません");
  });

  it("正常なリクエストを送信してレスポンスを受信する", async () => {
    globalThis.fetch = mockFetchResponse({
      content: [{ type: "text", text: "Hello back!" }],
      model: "claude-sonnet-4-6-20250227",
      usage: { input_tokens: 100, output_tokens: 50 },
    }) as unknown as typeof fetch;

    const backend = new AnthropicBackend(createConfig());
    const response = await backend.complete(createRequest());

    expect(response.content).toBe("Hello back!");
    expect(response.inputTokens).toBe(100);
    expect(response.outputTokens).toBe(50);
    expect(response.modelUsed).toBe("claude-sonnet-4-6-20250227");
  });

  it("system prompt を正しく分離する", async () => {
    const fetchMock = mockFetchResponse({
      content: [{ type: "text", text: "ok" }],
      model: "claude-sonnet-4-6-20250227",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const backend = new AnthropicBackend(createConfig());
    await backend.complete(createRequest());

    const callBody = JSON.parse(
      fetchMock.mock.calls[0][1].body as string,
    ) as Record<string, unknown>;
    expect(callBody).toHaveProperty("system", "You are a helpful assistant.");
    expect(callBody.messages).toEqual([
      { role: "user", content: "Hello" },
    ]);
  });

  it("temperature を正しく設定する", async () => {
    const fetchMock = mockFetchResponse({
      content: [{ type: "text", text: "ok" }],
      model: "claude-sonnet-4-6-20250227",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const backend = new AnthropicBackend(createConfig());
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

  it("ブラウザモードで direct-browser-access ヘッダを付与する", async () => {
    const fetchMock = mockFetchResponse({
      content: [{ type: "text", text: "ok" }],
      model: "claude-sonnet-4-6-20250227",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const backend = new AnthropicBackend(createConfig(), true);
    await backend.complete(createRequest());

    const callHeaders = fetchMock.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(callHeaders["anthropic-dangerous-direct-browser-access"]).toBe(
      "true",
    );
  });

  it("API エラー時に適切なエラーメッセージを返す", async () => {
    globalThis.fetch = mockFetchResponse(
      { error: { message: "Invalid API key" } },
      401,
    ) as unknown as typeof fetch;

    const backend = new AnthropicBackend(createConfig());
    await expect(backend.complete(createRequest())).rejects.toThrow(
      "Anthropic API エラー (401)",
    );
  });

  it("キャッシュトークンを正しく計算する", async () => {
    globalThis.fetch = mockFetchResponse({
      content: [{ type: "text", text: "ok" }],
      model: "claude-sonnet-4-6-20250227",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 80,
        cache_creation_input_tokens: 10,
      },
    }) as unknown as typeof fetch;

    const backend = new AnthropicBackend(createConfig());
    const response = await backend.complete(createRequest());
    expect(response.cachedTokens).toBe(90);
  });

  it("backendType() は 'anthropic' を返す", () => {
    const backend = new AnthropicBackend(createConfig());
    expect(backend.backendType()).toBe("anthropic");
  });

  it("useCache: true で system に cache_control を設定する", async () => {
    const fetchMock = mockFetchResponse({
      content: [{ type: "text", text: "ok" }],
      model: "claude-sonnet-4-6-20250227",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const backend = new AnthropicBackend(createConfig());
    await backend.complete(
      createRequest({
        options: { temperature: 0.0, useCache: true, useBatch: false },
      }),
    );

    const callBody = JSON.parse(
      fetchMock.mock.calls[0][1].body as string,
    ) as Record<string, unknown>;

    expect(Array.isArray(callBody.system)).toBe(true);
    const systemBlocks = callBody.system as Array<Record<string, unknown>>;
    expect(systemBlocks[0]).toEqual({
      type: "text",
      text: "You are a helpful assistant.",
      cache_control: { type: "ephemeral" },
    });
  });

  it("useCache: false で system を文字列で送信する", async () => {
    const fetchMock = mockFetchResponse({
      content: [{ type: "text", text: "ok" }],
      model: "claude-sonnet-4-6-20250227",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const backend = new AnthropicBackend(createConfig());
    await backend.complete(
      createRequest({
        options: { temperature: 0.0, useCache: false, useBatch: false },
      }),
    );

    const callBody = JSON.parse(
      fetchMock.mock.calls[0][1].body as string,
    ) as Record<string, unknown>;

    expect(typeof callBody.system).toBe("string");
    expect(callBody.system).toBe("You are a helpful assistant.");
  });
});
