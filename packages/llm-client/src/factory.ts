import type { ResolvedStepConfig } from "@groa/config";
import type { LlmBackend } from "./types.js";
import { ApiBackend } from "./api-backend.js";
import { ClaudeCodeBackend } from "./claude-code-backend.js";

/**
 * バックエンド種別に応じた LlmBackend を生成する
 */
export function createLlmBackend(
  config: ResolvedStepConfig,
  options: { isBrowser?: boolean } = {},
): LlmBackend {
  switch (config.backend) {
    case "api":
      return new ApiBackend(config, options.isBrowser);
    case "claude-code":
      return new ClaudeCodeBackend(config);
    default: {
      const _exhaustive: never = config.backend;
      throw new Error(`未知のバックエンド: ${_exhaustive}`);
    }
  }
}
