import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModelIdString } from "@groa/types";
import type { ResolvedStepConfig } from "@groa/config";
import type { LlmRequest } from "./types.js";

// vi.hoisted で vi.mock ファクトリより先にモック関数を確保
const execFilePromisified = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const mockExecFile = vi.fn();
  // promisify(execFile) が execFilePromisified を返すようにする
  (mockExecFile as unknown as Record<symbol, unknown>)[promisify.custom] =
    execFilePromisified;
  return { execFile: mockExecFile };
});

import {
  ClaudeCodeBackend,
  checkClaudeCodeAvailable,
} from "./claude-code-backend.js";

function createConfig(
  overrides: Partial<ResolvedStepConfig> = {},
): ResolvedStepConfig {
  return {
    backend: "claude-code",
    apiKey: null,
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

function makeJsonResponse(
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "Hello back!",
    cost_usd: 0.005,
    duration_ms: 1000,
    num_turns: 1,
    usage: { input_tokens: 100, output_tokens: 50 },
    ...overrides,
  });
}

function mockSuccess(stdout: string): void {
  execFilePromisified.mockResolvedValue({ stdout, stderr: "" });
}

function mockEnoent(): void {
  const error = new Error(
    "spawn claude ENOENT",
  ) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  execFilePromisified.mockRejectedValue(error);
}

describe("ClaudeCodeBackend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("backendType() は 'claude-code' を返す", () => {
    const backend = new ClaudeCodeBackend(createConfig());
    expect(backend.backendType()).toBe("claude-code");
  });

  it("デフォルトパス 'claude' を使用する", async () => {
    mockSuccess(makeJsonResponse());
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(createRequest());

    expect(execFilePromisified).toHaveBeenCalledWith(
      "claude",
      expect.any(Array),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("params.path でカスタムパスを指定できる", async () => {
    mockSuccess(makeJsonResponse());
    const backend = new ClaudeCodeBackend(
      createConfig({ params: { path: "/usr/local/bin/claude" } }),
    );
    await backend.complete(createRequest());

    expect(execFilePromisified).toHaveBeenCalledWith(
      "/usr/local/bin/claude",
      expect.any(Array),
      expect.any(Object),
    );
  });

  it("正常なリクエストを送信してレスポンスを受信する", async () => {
    mockSuccess(makeJsonResponse());
    const backend = new ClaudeCodeBackend(createConfig());
    const response = await backend.complete(createRequest());

    expect(response.content).toBe("Hello back!");
    expect(response.inputTokens).toBe(100);
    expect(response.outputTokens).toBe(50);
    expect(response.modelUsed).toBe("claude-sonnet-4-6-20250227");
    expect(response.cachedTokens).toBe(0);
    expect(response.costUsd).toBe(0.005);
  });

  it("-p, --model, --output-format json, --max-turns 1 の引数で実行する", async () => {
    mockSuccess(makeJsonResponse());
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(createRequest());

    const args = execFilePromisified.mock.calls[0][1] as string[];
    expect(args).toContain("-p");
    expect(args).toContain("--output-format");
    expect(args[args.indexOf("--output-format") + 1]).toBe("json");
    expect(args).toContain("--max-turns");
    expect(args[args.indexOf("--max-turns") + 1]).toBe("1");
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe(
      "claude-sonnet-4-6-20250227",
    );
  });

  it("--system-prompt でシステムプロンプトを指定する", async () => {
    mockSuccess(makeJsonResponse());
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(createRequest());

    const args = execFilePromisified.mock.calls[0][1] as string[];
    expect(args).toContain("--system-prompt");
    expect(args[args.indexOf("--system-prompt") + 1]).toBe(
      "You are a helpful assistant.",
    );
  });

  it("system message がない場合 --system-prompt を付与しない", async () => {
    mockSuccess(makeJsonResponse());
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(
      createRequest({
        messages: [{ role: "user", content: "Hello" }],
      }),
    );

    const args = execFilePromisified.mock.calls[0][1] as string[];
    expect(args).not.toContain("--system-prompt");
  });

  it("タイムアウト 180秒が適用される", async () => {
    mockSuccess(makeJsonResponse());
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(createRequest());

    const opts = execFilePromisified.mock.calls[0][2] as {
      timeout: number;
    };
    expect(opts.timeout).toBe(180_000);
  });

  it("claude コマンドが見つからない場合 ENOENT エラーを返す", async () => {
    mockEnoent();
    const backend = new ClaudeCodeBackend(createConfig());
    await expect(backend.complete(createRequest())).rejects.toThrow(
      "claude コマンドが見つかりません",
    );
  });

  it("ENOENT エラーはリトライ不可 (nonRetryable) である", async () => {
    mockEnoent();
    const backend = new ClaudeCodeBackend(createConfig());
    try {
      await backend.complete(createRequest());
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(
        (error as { nonRetryable: boolean }).nonRetryable,
      ).toBe(true);
    }
  });

  it("ENOENT エラーにインストール案内が含まれる", async () => {
    mockEnoent();
    const backend = new ClaudeCodeBackend(createConfig());
    await expect(backend.complete(createRequest())).rejects.toThrow(
      "npm install -g @anthropic-ai/claude-code",
    );
  });

  it("is_error: true のレスポンスでエラーを投げる（nonRetryable）", async () => {
    mockSuccess(
      makeJsonResponse({
        is_error: true,
        subtype: "error",
        result: "Authentication failed",
      }),
    );
    const backend = new ClaudeCodeBackend(createConfig());
    try {
      await backend.complete(createRequest());
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain(
        "Claude Code がエラーを返しました",
      );
      expect(
        (error as { nonRetryable: boolean }).nonRetryable,
      ).toBe(true);
    }
  });

  it("temperature !== 0 の場合に警告を記録する", async () => {
    mockSuccess(makeJsonResponse());
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(
      createRequest({
        options: { temperature: 0.7, useCache: false, useBatch: false },
      }),
    );

    const warnings = backend.getWarnings();
    expect(warnings).toContainEqual(
      expect.stringContaining("temperature"),
    );
  });

  it("temperature === 0 の場合は警告を記録しない", async () => {
    mockSuccess(makeJsonResponse());
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(createRequest());

    const warnings = backend.getWarnings();
    expect(warnings.some((w) => w.includes("temperature"))).toBe(false);
  });

  it("useBatch: true の場合に Batch API 非対応の警告を記録する", async () => {
    mockSuccess(makeJsonResponse());
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(
      createRequest({
        options: { temperature: 0.0, useCache: false, useBatch: true },
      }),
    );

    const warnings = backend.getWarnings();
    expect(warnings).toContainEqual(
      expect.stringContaining("Batch API"),
    );
  });

  it("useCache: true の場合に Prompt Caching 非対応の警告を記録する", async () => {
    mockSuccess(makeJsonResponse());
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(
      createRequest({
        options: { temperature: 0.0, useCache: true, useBatch: false },
      }),
    );

    const warnings = backend.getWarnings();
    expect(warnings).toContainEqual(
      expect.stringContaining("Prompt Caching"),
    );
  });

  it("usage が存在しない場合 inputTokens/outputTokens は null", async () => {
    mockSuccess(
      makeJsonResponse({
        usage: undefined,
      }),
    );
    const backend = new ClaudeCodeBackend(createConfig());
    const response = await backend.complete(createRequest());

    expect(response.inputTokens).toBeNull();
    expect(response.outputTokens).toBeNull();
  });
});

describe("checkClaudeCodeAvailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claude --version が成功すれば true を返す", async () => {
    execFilePromisified.mockResolvedValue({
      stdout: "1.0.0",
      stderr: "",
    });

    const result = await checkClaudeCodeAvailable();
    expect(result).toBe(true);

    const args = execFilePromisified.mock.calls[0][1] as string[];
    expect(args).toEqual(["--version"]);
  });

  it("claude コマンドが存在しない場合 false を返す", async () => {
    const error = new Error("ENOENT") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    execFilePromisified.mockRejectedValue(error);

    const result = await checkClaudeCodeAvailable();
    expect(result).toBe(false);
  });

  it("カスタムパスを指定して確認できる", async () => {
    execFilePromisified.mockResolvedValue({
      stdout: "1.0.0",
      stderr: "",
    });

    await checkClaudeCodeAvailable("/custom/path/claude");
    expect(execFilePromisified).toHaveBeenCalledWith(
      "/custom/path/claude",
      expect.any(Array),
      expect.any(Object),
    );
  });
});
