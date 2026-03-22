import { z } from "zod/v4";

// --- Backend ---

export const BACKENDS = ["anthropic", "openrouter", "claude-code"] as const;
export const BackendTypeSchema = z.enum(BACKENDS);
export type BackendType = z.infer<typeof BackendTypeSchema>;

// --- API Keys ---

const ApiKeysSchema = z
  .object({
    anthropic: z.string().optional(),
    openrouter: z.string().optional(),
  })
  .default(() => ({}));

// --- Claude Code ---

const ClaudeCodeSchema = z
  .object({
    path: z.string().default("claude"),
    maxTurns: z.number().default(1),
    maxBudgetUsd: z.number().nullable().default(null),
  })
  .default(() => ({ path: "claude", maxTurns: 1, maxBudgetUsd: null }));

// --- Model Tier ---

export type ModelTier = "quick" | "standard" | "deep";

/** Claude Code バックエンドのティア別デフォルトモデル（non-null 保証） */
export const CLAUDE_CODE_TIER_DEFAULTS: Record<ModelTier, string> = {
  quick: "haiku",
  standard: "sonnet",
  deep: "opus",
};

/** 全バックエンドのティア別デフォルトモデル */
export const BACKEND_TIER_DEFAULTS: Record<
  BackendType,
  Record<ModelTier, string | null>
> = {
  "claude-code": CLAUDE_CODE_TIER_DEFAULTS,
  anthropic: { quick: null, standard: null, deep: null },
  openrouter: { quick: null, standard: null, deep: null },
};

// --- Models ---

const ModelsSchema = z
  .object({
    quick: z.string().nullable().default(null),
    standard: z.string().nullable().default(null),
    deep: z.string().nullable().default(null),
    embedding: z.string().default("multilingual-e5-small"),
  })
  .default(() => ({
    quick: null,
    standard: null,
    deep: null,
    embedding: "multilingual-e5-small",
  }));

// --- Step configs ---

const StepOverrideSchema = z.object({
  model: z.string().nullable().default(null),
  apiKey: z.string().nullable().default(null),
});

const STEP_OVERRIDE_DEFAULT = { model: null, apiKey: null } as const;

const PreprocessStepSchema = z
  .object({
    minTweetLength: z.number().default(5),
    boilerplatePatterns: z.array(z.string()).default(() => []),
  })
  .default(() => ({ minTweetLength: 5, boilerplatePatterns: [] as string[] }));

const StatsStepSchema = z
  .object({})
  .default(() => ({}));

const ClassifyStepSchema = StepOverrideSchema.extend({
  batchSize: z.number().default(50),
}).default(() => ({ ...STEP_OVERRIDE_DEFAULT, batchSize: 50 }));

const AnalyzeStepSchema = StepOverrideSchema.extend({
  minClusterSize: z.number().default(50),
  maxClusterSize: z.number().default(3000),
}).default(() => ({
  ...STEP_OVERRIDE_DEFAULT,
  minClusterSize: 50,
  maxClusterSize: 3000,
}));

const SynthesizeStepSchema = StepOverrideSchema.default(() => ({
  ...STEP_OVERRIDE_DEFAULT,
}));

const EmbedStepSchema = StepOverrideSchema.default(() => ({
  ...STEP_OVERRIDE_DEFAULT,
}));

const RetrieveStepSchema = z
  .object({
    topK: z.number().default(5),
    sentimentDiversity: z.boolean().default(true),
    categoryDiversity: z.boolean().default(true),
  })
  .default(() => ({
    topK: 5,
    sentimentDiversity: true,
    categoryDiversity: true,
  }));

const GenerateStepSchema = StepOverrideSchema.extend({
  defaultTemperature: z.number().default(0.7),
  maxLength: z.number().default(280),
  numVariants: z.number().default(1),
}).default(() => ({
  ...STEP_OVERRIDE_DEFAULT,
  defaultTemperature: 0.7,
  maxLength: 280,
  numVariants: 1,
}));

const EvaluateStepSchema = StepOverrideSchema.extend({
  threshold: z.number().default(6.0),
}).default(() => ({ ...STEP_OVERRIDE_DEFAULT, threshold: 6.0 }));

const StepsSchema = z
  .object({
    preprocess: PreprocessStepSchema,
    stats: StatsStepSchema,
    classify: ClassifyStepSchema,
    analyze: AnalyzeStepSchema,
    synthesize: SynthesizeStepSchema,
    embed: EmbedStepSchema,
    retrieve: RetrieveStepSchema,
    generate: GenerateStepSchema,
    evaluate: EvaluateStepSchema,
  })
  .default(() => ({
    preprocess: { minTweetLength: 5, boilerplatePatterns: [] as string[] },
    stats: {},
    classify: { ...STEP_OVERRIDE_DEFAULT, batchSize: 50 },
    analyze: {
      ...STEP_OVERRIDE_DEFAULT,
      minClusterSize: 50,
      maxClusterSize: 3000,
    },
    synthesize: { ...STEP_OVERRIDE_DEFAULT },
    embed: { ...STEP_OVERRIDE_DEFAULT },
    retrieve: { topK: 5, sentimentDiversity: true, categoryDiversity: true },
    generate: {
      ...STEP_OVERRIDE_DEFAULT,
      defaultTemperature: 0.7,
      maxLength: 280,
      numVariants: 1,
    },
    evaluate: { ...STEP_OVERRIDE_DEFAULT, threshold: 6.0 },
  }));

// --- GroaConfig ---

export const GroaConfigSchema = z.object({
  backend: BackendTypeSchema.default("anthropic"),
  apiKeys: ApiKeysSchema,
  claudeCode: ClaudeCodeSchema,
  models: ModelsSchema,
  steps: StepsSchema,
  cacheDir: z.string().default(".groa"),
  costLimitUsd: z.number().default(10.0),
});

export type GroaConfig = z.infer<typeof GroaConfigSchema>;

/** デフォルト設定を生成する */
export function createDefaultConfig(): GroaConfig {
  return GroaConfigSchema.parse({});
}
