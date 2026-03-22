import type {
  Tweet,
  TweetCorpus,
  StyleStats,
  TaggedTweet,
  ClusterAnalysis,
  PersonaDocument,
  EmbeddingIndex,
} from "@groa/types";
import { Timestamp } from "@groa/types";
import type { GroaConfig } from "@groa/config";
import { resolveStepConfig } from "@groa/config";
import type { LlmBackend } from "@groa/llm-client";
import { createLlmBackend, BatchClient } from "@groa/llm-client";
import { preprocess } from "@groa/preprocess";
import {
  getTokenizer,
  calcLengthDistribution,
  calcCharTypeRatio,
  extractPunctuation,
  extractSentenceEndings,
  extractTopTokens,
  extractNgrams,
  extractTopEmoji,
  calcHourlyDistribution,
  calcLineBreaks,
  calcSharingRate,
  calcReplyRate,
} from "@groa/stats";
import { classify } from "@groa/classify";
import {
  buildClusters,
  computeAllClusterStats,
  analyzeClusters,
} from "@groa/analyze";
import { synthesize } from "@groa/synthesize";
import { createEmbedder, generateEmbeddings } from "@groa/embed";
import { StepCacheManager } from "./cache.js";
import { PipelineProgress } from "./progress.js";
import type { ProgressCallback } from "./progress.js";

/** ビルドフェーズのステップ実行順序 */
const BUILD_STEP_ORDER = [
  "preprocess",
  "stats",
  "classify",
  "analyze",
  "synthesize",
  "embed",
] as const;

export { BUILD_STEP_ORDER };

export type BuildStepId = (typeof BUILD_STEP_ORDER)[number];

const TOTAL_STEPS = BUILD_STEP_ORDER.length;

export interface BuildOptions {
  onProgress?: ProgressCallback;
  force?: boolean;
  costLimitUsd?: number | null;
}

export interface BuildResult {
  persona: PersonaDocument;
  embeddingIndex: EmbeddingIndex;
}

/**
 * ビルドフェーズ（Step 0〜5）をシーケンシャルに実行する。
 *
 * 各ステップは入力ハッシュによるキャッシュスキップに対応し、
 * 進捗コールバックとコスト上限ガードを備える。
 */
export async function runBuild(
  config: GroaConfig,
  input: Tweet[],
  options?: BuildOptions,
): Promise<BuildResult> {
  const force = options?.force ?? false;
  const cache = new StepCacheManager(config.cacheDir);
  const progress = new PipelineProgress({
    onProgress: options?.onProgress,
    costLimitUsd: options?.costLimitUsd,
  });

  // force 時は全キャッシュを無効化
  if (force) {
    await cache.invalidateFrom(
      BUILD_STEP_ORDER[0],
      [...BUILD_STEP_ORDER],
    );
  }

  // --- Step 0: preprocess ---
  const corpus = await executeStep<TweetCorpus>(
    "preprocess",
    0,
    cache,
    progress,
    force,
    () => cache.computeHash({ input, config: config.steps.preprocess }),
    () => {
      return preprocess(input, {
        minTweetLength: config.steps.preprocess.minTweetLength,
        boilerplatePatterns: config.steps.preprocess.boilerplatePatterns,
      });
    },
    0,
  );

  // --- Step 1: stats ---
  const styleStats = await executeStep<StyleStats>(
    "stats",
    1,
    cache,
    progress,
    force,
    () => cache.computeHash({ corpus }),
    async () => {
      const tokenizer = await getTokenizer();
      const texts = corpus.tweets.map((t) => t.text);
      const tokenized = corpus.tweets.map((t) => tokenizer.tokenize(t.text));
      const tokenizedWithIds = corpus.tweets.map((t, i) => ({
        id: t.id,
        tokens: tokenized[i] ?? [],
      }));

      return {
        lengthDistribution: calcLengthDistribution(
          texts.map((t) => t.length),
        ),
        punctuation: extractPunctuation(texts),
        sentenceEndings: extractSentenceEndings(tokenizedWithIds),
        charTypeRatio: calcCharTypeRatio(texts),
        topEmoji: extractTopEmoji(texts),
        topTokens: extractTopTokens(tokenized),
        topNgrams: extractNgrams(tokenized),
        hourlyDistribution: calcHourlyDistribution(
          corpus.tweets.map((t) => t.timestamp),
        ),
        lineBreaks: calcLineBreaks(texts),
        sharingRate: calcSharingRate(corpus.tweets),
        replyRate: calcReplyRate(corpus.tweets),
        sampleSize: corpus.tweets.length,
        analyzedAt: Timestamp(Date.now()),
      };
    },
    0,
  );

  // --- Step 2: classify ---
  const taggedTweets = await executeStep<TaggedTweet[]>(
    "classify",
    2,
    cache,
    progress,
    force,
    () =>
      cache.computeHash({ corpus, classifyConfig: config.steps.classify }),
    async () => {
      const resolved = resolveStepConfig(config, "classify");
      const backend = createLlmBackend(resolved);
      const batchClient =
        resolved.backend === "api" && resolved.apiKey
          ? new BatchClient(resolved.apiKey, resolved.model)
          : null;
      return classify(corpus, backend, batchClient, {
        batchSize: config.steps.classify.batchSize,
      });
    },
    null,
  );

  // --- Step 3: analyze ---
  const analyses = await executeStep<ClusterAnalysis[]>(
    "analyze",
    3,
    cache,
    progress,
    force,
    () => cache.computeHash({ taggedTweets, styleStats }),
    async () => {
      const resolved = resolveStepConfig(config, "analyze");
      const backend = createLlmBackend(resolved);
      const clusters = buildClusters(taggedTweets);
      const clustersWithStats = await computeAllClusterStats(clusters);
      return analyzeClusters(clustersWithStats, backend);
    },
    null,
  );

  // --- Step 4: synthesize ---
  const persona = await executeStep<PersonaDocument>(
    "synthesize",
    4,
    cache,
    progress,
    force,
    () =>
      cache.computeHash({
        analyses,
        styleStats,
        metadata: corpus.metadata,
      }),
    async () => {
      const resolved = resolveStepConfig(config, "synthesize");
      const backend = createLlmBackend(resolved);
      return synthesize(analyses, styleStats, corpus.metadata, backend);
    },
    null,
  );

  // --- Step 5: embed ---
  const embeddingIndex = await executeStep<EmbeddingIndex>(
    "embed",
    5,
    cache,
    progress,
    force,
    () => cache.computeHash({ corpus }),
    async () => {
      const embedder = await createEmbedder();
      return generateEmbeddings(corpus, embedder);
    },
    0,
  );

  progress.pipelineComplete();

  return { persona, embeddingIndex };
}

/**
 * 個別ステップのキャッシュ判定・実行・保存を共通化するヘルパー。
 *
 * @param stepName ステップ名
 * @param stepIndex ステップインデックス（0起算）
 * @param cache キャッシュマネージャ
 * @param progress 進捗トラッカー
 * @param force キャッシュ強制無効化フラグ
 * @param computeHash 入力ハッシュを計算する関数
 * @param execute ステップの実処理
 * @param defaultCostUsd キャッシュヒットせず実行した場合のデフォルトコスト（ローカル処理は0）
 */
async function executeStep<T>(
  stepName: string,
  stepIndex: number,
  cache: StepCacheManager,
  progress: PipelineProgress,
  force: boolean,
  computeHash: () => string,
  execute: () => T | Promise<T>,
  defaultCostUsd: number | null,
): Promise<T> {
  progress.stepStart(stepName, stepIndex, TOTAL_STEPS);

  const inputHash = computeHash();
  const canSkip = await cache.shouldSkip(stepName, inputHash, force);

  if (canSkip) {
    const cached = await cache.read(stepName);
    const costUsd = cached?.cost?.estimatedUsd ?? 0;
    progress.stepComplete(stepName, stepIndex, TOTAL_STEPS, costUsd);
    // shouldSkip が true なら cached は必ず存在する
    const output = (cached?.output ?? null) as T;
    return output;
  }

  const result = await execute();
  const costUsd = defaultCostUsd ?? 0;
  await cache.write(stepName, inputHash, result, null);
  progress.stepComplete(stepName, stepIndex, TOTAL_STEPS, costUsd);

  return result;
}

/**
 * 指定ステップ用の LLM バックエンドを生成する。
 * テスト容易性のためエクスポートする。
 */
export function createBackendForStep(
  config: GroaConfig,
  stepName: string,
): LlmBackend {
  const resolved = resolveStepConfig(config, stepName);
  return createLlmBackend(resolved);
}
