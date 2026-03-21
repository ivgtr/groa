import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ModelIdString } from "@groa/types";
import type { ResolvedStepConfig } from "@groa/config";
import type { LlmBackend, LlmRequest, LlmResponse } from "./types.js";
import { withRetry } from "./retry.js";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_PATH = "claude";

interface ClaudeCodeJsonResponse {
  type: string;
  subtype: string;
  is_error: boolean;
  result: string;
  cost_usd: number;
  duration_ms: number;
  num_turns: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/** Claude Code CLI バックエンド (Node.js のみ) */
export class ClaudeCodeBackend implements LlmBackend {
  private readonly claudePath: string;
  private readonly modelId: string;
  private readonly warnings: string[] = [];

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

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (request.options.useBatch) {
      this.warnings.push(
        "Claude Code バックエンドは Batch API に対応していません。逐次実行にフォールバックします。",
      );
    }

    if (request.options.useCache) {
      this.warnings.push(
        "Claude Code バックエンドでは Prompt Caching を明示的に制御できません。",
      );
    }

    if (request.options.temperature !== 0) {
      this.warnings.push(
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
      userMessages,
      "--model",
      this.modelId,
      "--output-format",
      "json",
      "--max-turns",
      "1",
    ];

    if (systemMessage) {
      args.push("--system-prompt", systemMessage.content);
    }

    try {
      const { stdout } = await execFileAsync(this.claudePath, args, {
        timeout: DEFAULT_TIMEOUT_MS,
      });

      const data = JSON.parse(stdout) as ClaudeCodeJsonResponse;

      if (data.is_error) {
        throw new Error(
          `Claude Code がエラーを返しました: ${data.result}。` +
            `claude コマンドの認証状態を確認してください。`,
        );
      }

      return {
        content: data.result,
        inputTokens: data.usage?.input_tokens ?? null,
        outputTokens: data.usage?.output_tokens ?? null,
        modelUsed: ModelIdString(this.modelId),
        cachedTokens: 0,
        costUsd: data.cost_usd ?? null,
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
        (nonRetryableError as { nonRetryable: boolean }).nonRetryable = true;
        throw nonRetryableError;
      }
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
