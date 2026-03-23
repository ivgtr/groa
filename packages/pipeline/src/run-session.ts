import type { Session } from "@groa/types";
import type { GroaConfig } from "@groa/config";
import { resolveStepConfig } from "@groa/config";
import { createLlmBackend, TokenTrackingBackend } from "@groa/llm-client";
import { createEmbedder } from "@groa/embed";
import { runSession as runSessionEngine } from "@groa/generate";
import type { SessionParams, PersonaContext, SessionCallbacks } from "@groa/generate";
import { evaluateSession } from "@groa/evaluate";
import { retrieve } from "@groa/retrieve";
import { PipelineProgress } from "./progress.js";
import type { ProgressCallback } from "./progress.js";
import { SessionStore } from "./session-store.js";

/** セッションパイプラインのステップ */
const SESSION_STEP_ORDER = ["session", "evaluate"] as const;

export type SessionStepId = (typeof SESSION_STEP_ORDER)[number];

export { SESSION_STEP_ORDER };

const TOTAL_STEPS = SESSION_STEP_ORDER.length;

export interface SessionPipelineOptions {
  onProgress?: ProgressCallback;
  costLimitUsd?: number | null;
  callbacks?: SessionCallbacks;
  skipEvaluation?: boolean;
}

/**
 * セッションパイプラインを実行する。
 * セッション実行 → 評価 → ログ保存。
 */
export async function runSessionPipeline(
  config: GroaConfig,
  contexts: PersonaContext[],
  params: SessionParams,
  options?: SessionPipelineOptions,
): Promise<Session> {
  const progress = new PipelineProgress({
    onProgress: options?.onProgress,
    costLimitUsd: options?.costLimitUsd,
  });

  // Embedder を作成
  const embedder = await createEmbedder();

  // LLM バックエンドを作成
  const resolved = resolveStepConfig(config, "generate");
  const rawBackend = createLlmBackend(resolved);
  const sessionTracked = new TokenTrackingBackend(rawBackend, "session");
  const evaluateTracked = new TokenTrackingBackend(rawBackend, "evaluate");

  // --- Step: session ---
  progress.stepStart("session", 0, TOTAL_STEPS);

  const session = await runSessionEngine(
    contexts,
    sessionTracked,
    embedder,
    params,
    options?.callbacks,
  );

  const sessionRecord = sessionTracked.getCostRecord();
  progress.stepComplete("session", 0, TOTAL_STEPS, sessionTracked.getDisplayCostUsd(), {
    inputTokens: sessionRecord.inputTokens,
    outputTokens: sessionRecord.outputTokens,
  });

  // --- Step: evaluate ---
  // chatモードはインタラクティブ対話のためデフォルトで評価をスキップ（spec.md §5.3）
  const skipEval = options?.skipEvaluation ?? (params.mode === "chat");

  if (!skipEval) {
    progress.stepStart("evaluate", 1, TOTAL_STEPS);

    // 評価用のfew-shotを取得（最初の参加者のコンテキストを使用）
    const primaryContext = contexts[0]!;
    const retrieveResult = await retrieve(
      params.topic,
      primaryContext.embeddingIndex,
      primaryContext.taggedTweets,
      embedder,
      {
        topK: config.steps.retrieve.topK,
        sentimentDiversity: config.steps.retrieve.sentimentDiversity,
        categoryDiversity: config.steps.retrieve.categoryDiversity,
      },
    );

    const evaluation = await evaluateSession(
      session,
      retrieveResult.forEvaluation,
      primaryContext.persona,
      evaluateTracked,
    );

    session.evaluation = evaluation;

    // 合格判定（authenticity >= threshold）
    const threshold = config.steps.evaluate.threshold;
    if (evaluation.authenticity < threshold) {
      console.warn(
        `⚠ authenticity (${evaluation.authenticity.toFixed(1)}) が合格基準 (${threshold.toFixed(1)}) 未満です。`,
      );
    }

    const evalRecord = evaluateTracked.getCostRecord();
    progress.stepComplete("evaluate", 1, TOTAL_STEPS, evaluateTracked.getDisplayCostUsd(), {
      inputTokens: evalRecord.inputTokens,
      outputTokens: evalRecord.outputTokens,
    });
  }

  progress.pipelineComplete();

  // --- ログ保存 ---
  const store = new SessionStore(config.cacheDir);
  await store.save(session);

  return session;
}
