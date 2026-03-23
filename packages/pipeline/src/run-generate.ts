import type {
  PersonaDocument,
  TaggedTweet,
  EmbeddingIndex,
  GeneratedText,
} from "@groa/types";
import type { GroaConfig } from "@groa/config";
import { resolveStepConfig } from "@groa/config";
import { createLlmBackend, TokenTrackingBackend } from "@groa/llm-client";
import { retrieve } from "@groa/retrieve";
import { createEmbedder } from "@groa/embed";
import { generate } from "@groa/generate";
import type { GenerateParams } from "@groa/generate";
import { evaluate } from "@groa/evaluate";
import { PipelineProgress } from "./progress.js";
import type { ProgressCallback } from "./progress.js";

/** ジェネレートフェーズのステップ実行順序 */
const GENERATE_STEP_ORDER = ["retrieve", "generate", "evaluate"] as const;

export { GENERATE_STEP_ORDER };

export type GenerateStepId = (typeof GENERATE_STEP_ORDER)[number];

const TOTAL_STEPS = GENERATE_STEP_ORDER.length;

export interface GenerateOptions {
  onProgress?: ProgressCallback;
  costLimitUsd?: number | null;
}

/**
 * ジェネレートフェーズ（Step 6-8）を実行する。
 * ビルドフェーズの成果物を使って、テキスト生成と評価を行う。
 */
export async function runGenerate(
  config: GroaConfig,
  persona: PersonaDocument,
  taggedTweets: TaggedTweet[],
  embeddingIndex: EmbeddingIndex,
  params: GenerateParams,
  options?: GenerateOptions,
): Promise<GeneratedText | GeneratedText[]> {
  const progress = new PipelineProgress({
    onProgress: options?.onProgress,
    costLimitUsd: options?.costLimitUsd,
  });

  // Embedder を作成（retrieve ステップでクエリ埋め込みに使用）
  const embedder = await createEmbedder();

  // LLM バックエンドを作成（generate / evaluate で使用）
  const resolved = resolveStepConfig(config, "generate");
  const rawBackend = createLlmBackend(resolved);

  // ステップごとに別インスタンスでトークンを追跡
  const generateTracked = new TokenTrackingBackend(rawBackend, "generate");
  const evaluateTracked = new TokenTrackingBackend(rawBackend, "evaluate");

  // --- Step 6: retrieve ---
  progress.stepStart("retrieve", 0, TOTAL_STEPS);

  const retrieveResult = await retrieve(
    params.topic,
    embeddingIndex,
    taggedTweets,
    embedder,
    {
      topK: config.steps.retrieve.topK,
      sentimentDiversity: config.steps.retrieve.sentimentDiversity,
      categoryDiversity: config.steps.retrieve.categoryDiversity,
    },
  );

  progress.stepComplete("retrieve", 0, TOTAL_STEPS, 0);

  // --- Step 7: generate ---
  progress.stepStart("generate", 1, TOTAL_STEPS);

  const generationResult = await generate(
    persona,
    retrieveResult.forGeneration,
    generateTracked,
    params,
  );

  const genRecord = generateTracked.getCostRecord();
  progress.stepComplete("generate", 1, TOTAL_STEPS, generateTracked.getDisplayCostUsd(), {
    inputTokens: genRecord.inputTokens,
    outputTokens: genRecord.outputTokens,
  });

  // --- Step 8: evaluate ---
  progress.stepStart("evaluate", 2, TOTAL_STEPS);

  let result: GeneratedText | GeneratedText[];

  if (Array.isArray(generationResult)) {
    const evaluatedResults: GeneratedText[] = [];
    for (const variant of generationResult) {
      const evaluated = await evaluate(
        variant,
        retrieveResult.forEvaluation,
        persona,
        evaluateTracked,
      );
      evaluatedResults.push(evaluated);
    }
    result = evaluatedResults;
  } else {
    result = await evaluate(
      generationResult,
      retrieveResult.forEvaluation,
      persona,
      evaluateTracked,
    );
  }

  const evalRecord = evaluateTracked.getCostRecord();
  progress.stepComplete("evaluate", 2, TOTAL_STEPS, evaluateTracked.getDisplayCostUsd(), {
    inputTokens: evalRecord.inputTokens,
    outputTokens: evalRecord.outputTokens,
  });

  progress.pipelineComplete();

  return result;
}
