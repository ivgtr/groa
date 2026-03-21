export {
  BACKENDS,
  BackendTypeSchema,
  GroaConfigSchema,
  createDefaultConfig,
} from "./schema.js";
export type { BackendType, GroaConfig } from "./schema.js";

export {
  resolveStepConfig,
  checkConfigPermissions,
} from "./resolve.js";
export type { ResolvedStepConfig } from "./resolve.js";
