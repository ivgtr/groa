import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { ModelIdString } from "@groa/types";
import type { ResolvedStepConfig } from "@groa/config";
import type { LlmBackend, LlmRequest, LlmResponse } from "./types.js";
import { withRetry } from "./retry.js";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_PATH = "claude";

interface ClaudeCodeJsonResponse {
  type: string;
  subtype: string;
  is_error: boolean;
  result: string;
  total_cost_usd: number;
  duration_ms: number;
  num_turns: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/**
 * spawn でコマンドを実行し、stdin にデータを書き込んで stdout/stderr を収集する。
 * execFile の input オプションは非同期版では動作しないため、spawn を使用する。
 */
function spawnWithStdin(
  command: string,
  args: string[],
  stdinData: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString("utf8");
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString("utf8");
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(
          `Command failed: ${command} ${args[0]}`,
        ) as Error & {
          code: number | null;
          signal: string | null;
          killed: boolean;
          stderr: string;
          stdout: string;
        };
        error.code = code;
        error.signal = signal;
        error.killed = child.killed;
        error.stderr = stderr;
        error.stdout = stdout;
        reject(error);
      }
    });

    child.stdin.write(stdinData, "utf8");
    child.stdin.end();
  });
}

/** Claude Code CLI バックエンド (Node.js のみ) */
export class ClaudeCodeBackend implements LlmBackend {
  private readonly claudePath: string;
  private readonly modelId: string;
  private readonly warnings: string[] = [];
  private readonly emittedWarningTypes = new Set<string>();

  constructor(config: ResolvedStepConfig) {
    const claudeCodeParams = config.params as {
      path?: string;
      maxTurns?: number;
    };
    this.claudePath = claudeCodeParams.path ?? DEFAULT_PATH;
    this.modelId = config.model;
  }

  backendType(): "claude-code" {
    return "claude-code";
  }

  getWarnings(): string[] {
    return [...this.warnings];
  }

  private addWarningOnce(message: string): void {
    if (!this.emittedWarningTypes.has(message)) {
      this.emittedWarningTypes.add(message);
      this.warnings.push(message);
    }
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (request.options.useBatch) {
      this.addWarningOnce(
        "Claude Code バックエンドは Batch API に対応していません。逐次実行にフォールバックします。",
      );
    }

    if (request.options.useCache) {
      this.addWarningOnce(
        "Claude Code バックエンドでは Prompt Caching を明示的に制御できません。",
      );
    }

    if (request.options.temperature !== 0) {
      this.addWarningOnce(
        `Claude Code バックエンドでは temperature (${request.options.temperature}) を指定できません。無視されます。`,
      );
    }

    return withRetry(() => this.executeCommand(request), {
      maxRetries: 3,
      initialDelayMs: 1000,
      multiplier: 2,
    });
  }

  private async executeCommand(request: LlmRequest): Promise<LlmResponse> {
    const systemMessage = request.messages.find((m) => m.role === "system");
    const userMessages = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => m.content)
      .join("\n\n");

    const args = [
      "-p",
      "--model", this.modelId,
      "--tools", "",                // groa はツール不要 — コンテキスト注入を抑制
      "--setting-sources", "user",  // project/local の CLAUDE.md・MCP をスキップ
      "--no-session-persistence",   // セッション保存不要
      "--effort", "low",            // extended thinking を抑制し応答速度を改善
    ];

    if (systemMessage) {
      args.push("--system-prompt", systemMessage.content);
    }

    args.push("--output-format", "json", "--max-turns", "1");

    try {
      const { stdout } = await spawnWithStdin(
        this.claudePath,
        args,
        userMessages,
        DEFAULT_TIMEOUT_MS,
      );

      const data = JSON.parse(stdout) as ClaudeCodeJsonResponse;

      if (data.is_error) {
        const error = new Error(
          `Claude Code がエラーを返しました: ${data.result}。` +
            `claude コマンドの認証状態を確認してください。`,
        );
        (error as unknown as { nonRetryable: boolean }).nonRetryable = true;
        throw error;
      }

      return {
        content: data.result,
        inputTokens: data.usage?.input_tokens ?? null,
        outputTokens: data.usage?.output_tokens ?? null,
        modelUsed: ModelIdString(this.modelId),
        cachedTokens: data.usage?.cache_read_input_tokens ?? 0,
        costUsd: data.total_cost_usd ?? null,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        const nonRetryableError = new Error(
          `claude コマンドが見つかりません (PATH: ${this.claudePath})。` +
            `Claude Code をインストールしてください: ` +
            `npm install -g @anthropic-ai/claude-code`,
        );
        (nonRetryableError as unknown as { nonRetryable: boolean }).nonRetryable = true;
        throw nonRetryableError;
      }

      // コマンド失敗時の診断情報を出力
      const execError = error as {
        code?: number | string;
        signal?: string;
        killed?: boolean;
        stderr?: string;
        stdout?: string;
      };
      console.error(
        `[claude-code] コマンド失敗:`,
        JSON.stringify(
          {
            message:
              error instanceof Error ? error.message : String(error),
            exitCode: execError.code,
            signal: execError.signal,
            killed: execError.killed,
            stderr: execError.stderr?.slice(0, 500),
            args: args.map((a) =>
              a.length > 100 ? `${a.slice(0, 100)}...(${a.length}chars)` : a,
            ),
            inputLength: userMessages.length,
          },
          null,
          2,
        ),
      );

      throw error;
    }
  }
}

/** claude コマンドが PATH 上に存在するか確認する */
export async function checkClaudeCodeAvailable(
  claudePath = DEFAULT_PATH,
): Promise<boolean> {
  try {
    await execFileAsync(claudePath, ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
