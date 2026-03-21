import type { ResolvedStepConfig } from "@groa/config";
import type { LlmBackend } from "./types.js";
import { ApiBackend } from "./api-backend.js";

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
      throw new Error(
        "Claude Code バックエンドは未実装です。" +
          "@groa/llm-client の Claude Code 実装を追加してください。",
      );
    default: {
      const _exhaustive: never = config.backend;
      throw new Error(`未知のバックエンド: ${_exhaustive}`);
    }
  }
}
