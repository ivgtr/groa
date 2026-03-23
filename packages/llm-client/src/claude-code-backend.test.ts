import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EventEmitter } from "node:events";
import { ModelIdString } from "@groa/types";
import type { ResolvedStepConfig } from "@groa/config";
import type { LlmRequest } from "./types.js";

// --- モック ---

const mockSpawnResult = vi.hoisted(() => ({
  stdout: "",
  stderr: "",
  exitCode: 0 as number | null,
  signal: null as string | null,
  error: null as Error | null,
}));

const execFilePromisified = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ stdout: "1.0.0", stderr: "" }),
);

vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const { EventEmitter } = await import("node:events");

  const mockExecFile = vi.fn();
  (mockExecFile as unknown as Record<symbol, unknown>)[promisify.custom] =
    execFilePromisified;

  const mockSpawn = vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      stdout: EventEmitter;
      stderr: EventEmitter;
      killed: boolean;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write: vi.fn(), end: vi.fn() };
    child.killed = false;

    process.nextTick(() => {
      if (mockSpawnResult.error) {
        child.emit("error", mockSpawnResult.error);
        return;
      }
      if (mockSpawnResult.stdout) {
        child.stdout.emit("data", Buffer.from(mockSpawnResult.stdout));
      }
      if (mockSpawnResult.stderr) {
        child.stderr.emit("data", Buffer.from(mockSpawnResult.stderr));
      }
      child.emit(
        "close",
        mockSpawnResult.exitCode,
        mockSpawnResult.signal,
      );
    });

    return child;
  });

  return {
    execFile: mockExecFile,
    spawn: mockSpawn,
    __mockSpawn: mockSpawn,
  };
});

const { __mockSpawn: mockSpawn } = (await import(
  "node:child_process"
)) as unknown as {
  __mockSpawn: ReturnType<typeof vi.fn>;
};

import {
  ClaudeCodeBackend,
  checkClaudeCodeAvailable,
} from "./claude-code-backend.js";

// --- ヘルパー ---

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
    total_cost_usd: 0.005,
    duration_ms: 1000,
    num_turns: 1,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 30,
    },
    ...overrides,
  });
}

function mockSuccess(stdout?: string): void {
  mockSpawnResult.stdout = stdout ?? makeJsonResponse();
  mockSpawnResult.stderr = "";
  mockSpawnResult.exitCode = 0;
  mockSpawnResult.signal = null;
  mockSpawnResult.error = null;
}

function mockEnoent(): void {
  const error = new Error(
    "spawn claude ENOENT",
  ) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  mockSpawnResult.error = error;
  mockSpawnResult.exitCode = null;
}

// --- テスト ---

describe("ClaudeCodeBackend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnResult.stdout = "";
    mockSpawnResult.stderr = "";
    mockSpawnResult.exitCode = 0;
    mockSpawnResult.signal = null;
    mockSpawnResult.error = null;
  });

  it("backendType() は 'claude-code' を返す", () => {
    const backend = new ClaudeCodeBackend(createConfig());
    expect(backend.backendType()).toBe("claude-code");
  });

  it("デフォルトパス 'claude' を使用する", async () => {
    mockSuccess();
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(createRequest());

    expect(mockSpawn).toHaveBeenCalledWith(
      "claude",
      expect.any(Array),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("params.path でカスタムパスを指定できる", async () => {
    mockSuccess();
    const backend = new ClaudeCodeBackend(
      createConfig({ params: { path: "/usr/local/bin/claude" } }),
    );
    await backend.complete(createRequest());

    expect(mockSpawn).toHaveBeenCalledWith(
      "/usr/local/bin/claude",
      expect.any(Array),
      expect.any(Object),
    );
  });

  it("正常なリクエストを送信してレスポンスを受信する", async () => {
    mockSuccess();
    const backend = new ClaudeCodeBackend(createConfig());
    const response = await backend.complete(createRequest());

    expect(response.content).toBe("Hello back!");
    expect(response.inputTokens).toBe(100);
    expect(response.outputTokens).toBe(50);
    expect(response.modelUsed).toBe("claude-sonnet-4-6-20250227");
    expect(response.cachedTokens).toBe(30);
    expect(response.costUsd).toBe(0.005);
  });

  it("必要なフラグがすべて引数に含まれる", async () => {
    mockSuccess();
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(createRequest());

    const args = mockSpawn.mock.calls[0][1] as string[];
    expect(args).toContain("-p");
    expect(args).toContain("--output-format");
    expect(args[args.indexOf("--output-format") + 1]).toBe("json");
    expect(args).toContain("--max-turns");
    expect(args[args.indexOf("--max-turns") + 1]).toBe("1");
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe(
      "claude-sonnet-4-6-20250227",
    );
    expect(args).toContain("--tools");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--setting-sources");
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("user");
    expect(args).toContain("--no-session-persistence");
    expect(args).toContain("--effort");
    expect(args[args.indexOf("--effort") + 1]).toBe("low");
    // --verbose は不要（json モード）
    expect(args).not.toContain("--verbose");
    // userMessages は args に含まれず stdin で渡される
    expect(args).not.toContain("Hello");
  });

  it("userMessages を stdin 経由で渡す", async () => {
    mockSuccess();
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(createRequest());

    const child = mockSpawn.mock.results[0].value as {
      stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    };
    expect(child.stdin.write).toHaveBeenCalledWith("Hello", "utf8");
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it("--system-prompt でシステムプロンプトを指定する", async () => {
    mockSuccess();
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(createRequest());

    const args = mockSpawn.mock.calls[0][1] as string[];
    expect(args).toContain("--system-prompt");
    expect(args[args.indexOf("--system-prompt") + 1]).toBe(
      "You are a helpful assistant.",
    );
  });

  it("system message がない場合 --system-prompt を付与しない", async () => {
    mockSuccess();
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(
      createRequest({
        messages: [{ role: "user", content: "Hello" }],
      }),
    );

    const args = mockSpawn.mock.calls[0][1] as string[];
    expect(args).not.toContain("--system-prompt");
  });

  it("タイムアウト 600秒が適用される", async () => {
    mockSuccess();
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(createRequest());

    const opts = mockSpawn.mock.calls[0][2] as { timeout: number };
    expect(opts.timeout).toBe(600_000);
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
    mockSuccess();
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
    mockSuccess();
    const backend = new ClaudeCodeBackend(createConfig());
    await backend.complete(createRequest());

    const warnings = backend.getWarnings();
    expect(warnings.some((w) => w.includes("temperature"))).toBe(false);
  });

  it("useBatch: true の場合に Batch API 非対応の警告を記録する", async () => {
    mockSuccess();
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
    mockSuccess();
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
    mockSuccess(makeJsonResponse({ usage: undefined }));
    const backend = new ClaudeCodeBackend(createConfig());
    const response = await backend.complete(createRequest());

    expect(response.inputTokens).toBeNull();
    expect(response.outputTokens).toBeNull();
  });

  it("total_cost_usd から costUsd を正しく取得する", async () => {
    mockSuccess(makeJsonResponse({ total_cost_usd: 0.123 }));
    const backend = new ClaudeCodeBackend(createConfig());
    const response = await backend.complete(createRequest());

    expect(response.costUsd).toBe(0.123);
  });

  it("cache_read_input_tokens から cachedTokens を正しく取得する", async () => {
    mockSuccess(
      makeJsonResponse({
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 500,
        },
      }),
    );
    const backend = new ClaudeCodeBackend(createConfig());
    const response = await backend.complete(createRequest());

    expect(response.cachedTokens).toBe(500);
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
