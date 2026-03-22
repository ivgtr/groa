import type { ResolvedStepConfig } from "@groa/config";
import type { LlmBackend } from "./types.js";
import { AnthropicBackend } from "./anthropic-backend.js";
import { ClaudeCodeBackend } from "./claude-code-backend.js";
import { OpenRouterBackend } from "./openrouter-backend.js";

/**
 * バックエンド種別に応じた LlmBackend を生成する
 */
export function createLlmBackend(
  config: ResolvedStepConfig,
  options: { isBrowser?: boolean } = {},
): LlmBackend {
  switch (config.backend) {
    case "anthropic":
      return new AnthropicBackend(config, options.isBrowser);
    case "openrouter":
      return new OpenRouterBackend(config);
    case "claude-code":
      return new ClaudeCodeBackend(config);
    default: {
      const _exhaustive: never = config.backend;
      throw new Error(`未知のバックエンド: ${_exhaustive}`);
    }
  }
}
