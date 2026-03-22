import { ModelIdString } from "@groa/types";
import type { GroaConfig, BackendType, ModelTier } from "./schema.js";
import { CLAUDE_CODE_TIER_DEFAULTS } from "./schema.js";

/** 各工程が受け取る解決済み設定 */
export interface ResolvedStepConfig {
  backend: BackendType;
  apiKey: string | null;
  model: ModelIdString;
  params: Record<string, unknown>;
}

/** モデルティアと工程の対応 */
const STEP_MODEL_TIER: Record<string, ModelTier> = {
  classify: "quick",
  analyze: "standard",
  synthesize: "deep",
  generate: "standard",
  evaluate: "standard",
};

/**
 * 工程名に対する設定を解決する
 *
 * anthropic バックエンド:
 *   1. steps.{stepName}.apiKey / steps.{stepName}.model（工程別指定）
 *   2. apiKeys.anthropic / models.{tier}（グローバル設定）
 *   3. 環境変数 ANTHROPIC_API_KEY（フォールバック）
 *
 * openrouter バックエンド:
 *   1. steps.{stepName}.apiKey / steps.{stepName}.model（工程別指定）
 *   2. apiKeys.openrouter / models.{tier}（グローバル設定）
 *   3. 環境変数 OPENROUTER_API_KEY（フォールバック）
 *
 * claude-code バックエンド:
 *   1. steps.{stepName}.model（工程別指定）
 *   2. models.{tier}（グローバル設定）
 *   3. Claude Code のデフォルトモデル（フォールバック）
 */
export function resolveStepConfig(
  config: GroaConfig,
  stepName: string,
  env: Record<string, string | undefined> = process.env,
): ResolvedStepConfig {
  const stepConfig = config.steps[stepName as keyof typeof config.steps] as
    | Record<string, unknown>
    | undefined;

  const tier = STEP_MODEL_TIER[stepName];
  const params = extractParams(stepConfig, stepName);

  if (config.backend === "anthropic" || config.backend === "openrouter") {
    const apiKey = resolveApiKey(config, stepConfig, env);
    const model = resolveModel(config, stepConfig, tier, stepName);
    return { backend: config.backend, apiKey, model, params };
  }

  // claude-code バックエンド
  const model = tryResolveModel(config, stepConfig, tier)
    ?? ModelIdString(CLAUDE_CODE_TIER_DEFAULTS[tier ?? "standard"]);
  return { backend: "claude-code", apiKey: null, model, params };
}

function resolveApiKey(
  config: GroaConfig,
  stepConfig: Record<string, unknown> | undefined,
  env: Record<string, string | undefined>,
): string | null {
  // 1. 工程別指定
  const stepApiKey = stepConfig?.["apiKey"];
  if (typeof stepApiKey === "string") return stepApiKey;

  // 2. グローバル設定（バックエンド別）
  if (config.backend === "openrouter") {
    const key = config.apiKeys.openrouter;
    if (key) return expandEnvVar(key, env);
    return env["OPENROUTER_API_KEY"] ?? null;
  }

  const globalApiKey = config.apiKeys.anthropic;
  if (globalApiKey) {
    return expandEnvVar(globalApiKey, env);
  }

  // 3. 環境変数フォールバック
  return env["ANTHROPIC_API_KEY"] ?? null;
}

/**
 * モデルを解決する（副作用なし）。
 * 設定から見つからない場合は null を返す。
 */
function tryResolveModel(
  config: GroaConfig,
  stepConfig: Record<string, unknown> | undefined,
  tier: ModelTier | undefined,
): ModelIdString | null {
  // 1. 工程別指定
  const stepModel = stepConfig?.["model"];
  if (typeof stepModel === "string") return ModelIdString(stepModel);

  // 2. グローバル設定（ティア指定がある場合）
  if (tier) {
    const modelId = config.models[tier];
    return modelId ? ModelIdString(modelId) : null;
  }

  // 3. フォールバック（ティアなしの工程: preprocess, stats, retrieve 等）
  return config.models.standard ? ModelIdString(config.models.standard) : null;
}

/**
 * モデルを解決する。見つからない場合はエラーを throw する。
 * anthropic / openrouter バックエンド用。
 */
function resolveModel(
  config: GroaConfig,
  stepConfig: Record<string, unknown> | undefined,
  tier: ModelTier | undefined,
  stepName: string,
): ModelIdString {
  const model = tryResolveModel(config, stepConfig, tier);
  if (model) return model;

  const tierHint = tier ?? "standard";
  throw new Error(
    `モデルが設定されていません (step: ${stepName}, tier: ${tierHint})。` +
      `groa config set models.${tierHint} <model-id> を実行してください。`,
  );
}

function extractParams(
  stepConfig: Record<string, unknown> | undefined,
  _stepName: string,
): Record<string, unknown> {
  if (!stepConfig) return {};

  const { model: _, apiKey: __, ...params } = stepConfig;
  return params;
}

/** 環境変数参照 (${VAR_NAME}) を展開する */
function expandEnvVar(
  value: string,
  env: Record<string, string | undefined>,
): string {
  return value.replace(/\$\{(\w+)\}/g, (_, varName: string) => {
    return env[varName] ?? "";
  });
}

/** groa.json にAPIキーが直接記述されている場合のパーミッション警告 */
export function checkConfigPermissions(
  config: GroaConfig,
  filePath: string,
  statFn?: (path: string) => { mode: number },
): string[] {
  const warnings: string[] = [];

  const hasDirectApiKey =
    (config.apiKeys.anthropic &&
      !config.apiKeys.anthropic.startsWith("${")) ||
    (config.apiKeys.openrouter &&
      !config.apiKeys.openrouter.startsWith("${")) ||
    Object.values(config.steps).some(
      (step) =>
        typeof step === "object" &&
        step !== null &&
        "apiKey" in step &&
        typeof step.apiKey === "string" &&
        step.apiKey !== null,
    );

  if (!hasDirectApiKey) return warnings;

  if (typeof statFn === "function") {
    try {
      const stat = statFn(filePath);
      const permissions = stat.mode & 0o777;
      if (permissions !== 0o600) {
        warnings.push(
          `groa.json にAPIキーが直接記述されています。` +
            `パーミッションが ${permissions.toString(8)} です（推奨: 600）。` +
            `chmod 600 ${filePath} を実行してください。`,
        );
      }
    } catch {
      // stat 失敗時は警告をスキップ
    }
  }

  return warnings;
}
