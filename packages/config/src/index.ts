export {
  BACKENDS,
  BackendTypeSchema,
  CLAUDE_CODE_TIER_DEFAULTS,
  BACKEND_TIER_DEFAULTS,
  GroaConfigSchema,
  createDefaultConfig,
} from "./schema.js";
export type { BackendType, ModelTier, GroaConfig } from "./schema.js";

export {
  resolveStepConfig,
  checkConfigPermissions,
} from "./resolve.js";
export type { ResolvedStepConfig } from "./resolve.js";
