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
import type { LlmBackend, CostRecord } from "@groa/llm-client";
import { createLlmBackend, BatchClient, TokenTrackingBackend } from "@groa/llm-client";
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
  mergeClusterAnalyses,
} from "@groa/analyze";
import { synthesize } from "@groa/synthesize";
import { createEmbedder, generateEmbeddings } from "@groa/embed";
import { StepCacheManager } from "./cache.js";
import { PipelineProgress } from "./progress.js";
import type { ProgressCallback, StepTokenUsage } from "./progress.js";

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

/** executeStep が LLM ステップから取得するコスト・トークン情報 */
interface LlmStepInfo {
  costUsd: number;
  costRecord: CostRecord;
  tokenUsage: StepTokenUsage;
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
  );

  // --- Step 2: classify ---
  const classifyResolved = resolveStepConfig(config, "classify");
  const classifyTracked = new TokenTrackingBackend(
    createLlmBackend(classifyResolved),
    "classify",
  );

  const taggedTweets = await executeStep<TaggedTweet[]>(
    "classify",
    2,
    cache,
    progress,
    force,
    () =>
      cache.computeHash({ corpus, classifyConfig: config.steps.classify }),
    async () => {
      const batchClient =
        classifyResolved.backend === "anthropic" && classifyResolved.apiKey
          ? new BatchClient(classifyResolved.apiKey, classifyResolved.model)
          : null;
      const batchSize = config.steps.classify.batchSize ?? 50;
      let warningsFlushed = false;
      return classify(corpus, classifyTracked, batchClient, {
        batchSize,
        onProgress: (processed, total) => {
          if (!warningsFlushed) {
            warningsFlushed = true;
            for (const w of classifyTracked.getWarnings()) {
              progress.stepWarning("classify", w);
            }
          }
          const batchNum = Math.ceil(processed / batchSize);
          const totalBatches = Math.ceil(total / batchSize);
          progress.stepProgress("classify", `${batchNum}/${totalBatches}`);
        },
      });
    },
    () => toLlmStepInfo(classifyTracked),
  );

  // --- Step 3: analyze ---
  const analyzeTracked = new TokenTrackingBackend(
    createLlmBackend(resolveStepConfig(config, "analyze")),
    "analyze",
  );

  const analyses = await executeStep<ClusterAnalysis[]>(
    "analyze",
    3,
    cache,
    progress,
    force,
    // _v: 2 — mergeClusterAnalyses 追加に伴い旧キャッシュを無効化
    () => cache.computeHash({ taggedTweets, styleStats, _v: 2 }),
    async () => {
      const clusters = buildClusters(taggedTweets);
      const clustersWithStats = await computeAllClusterStats(clusters);
      const rawAnalyses = await analyzeClusters(clustersWithStats, analyzeTracked);
      return mergeClusterAnalyses(rawAnalyses, analyzeTracked);
    },
    () => toLlmStepInfo(analyzeTracked),
  );

  // --- Step 4: synthesize ---
  const synthesizeTracked = new TokenTrackingBackend(
    createLlmBackend(resolveStepConfig(config, "synthesize")),
    "synthesize",
  );

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
      return synthesize(analyses, styleStats, corpus.metadata, synthesizeTracked);
    },
    () => toLlmStepInfo(synthesizeTracked),
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
  );

  progress.pipelineComplete();

  return { persona, embeddingIndex };
}

/** TokenTrackingBackend から LlmStepInfo を生成する */
function toLlmStepInfo(tracked: TokenTrackingBackend): LlmStepInfo {
  const record = tracked.getCostRecord();
  const displayCost = tracked.getDisplayCostUsd();
  return {
    costUsd: displayCost,
    // キャッシュにもプロバイダー報告コストを保存し、キャッシュヒット時の表示を一貫させる
    costRecord: { ...record, estimatedUsd: displayCost },
    tokenUsage: {
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
    },
  };
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
 * @param getLlmInfo LLM ステップのコスト・トークン情報取得関数（ローカル処理は省略）
 */
async function executeStep<T>(
  stepName: string,
  stepIndex: number,
  cache: StepCacheManager,
  progress: PipelineProgress,
  force: boolean,
  computeHash: () => string,
  execute: () => T | Promise<T>,
  getLlmInfo?: () => LlmStepInfo,
): Promise<T> {
  progress.stepStart(stepName, stepIndex, TOTAL_STEPS);

  const inputHash = computeHash();
  const canSkip = await cache.shouldSkip(stepName, inputHash, force);

  if (canSkip) {
    const cached = await cache.read(stepName);
    const costUsd = cached?.cost?.estimatedUsd ?? 0;
    const tokenUsage = cached?.cost
      ? { inputTokens: cached.cost.inputTokens, outputTokens: cached.cost.outputTokens }
      : undefined;
    progress.stepComplete(stepName, stepIndex, TOTAL_STEPS, costUsd, tokenUsage);
    // shouldSkip が true なら cached は必ず存在する
    const output = (cached?.output ?? null) as T;
    return output;
  }

  const result = await execute();
  const llmInfo = getLlmInfo?.();
  const costUsd = llmInfo?.costUsd ?? 0;
  await cache.write(stepName, inputHash, result, llmInfo?.costRecord ?? null);
  progress.stepComplete(stepName, stepIndex, TOTAL_STEPS, costUsd, llmInfo?.tokenUsage);

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
