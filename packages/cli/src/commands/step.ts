import { Command } from "commander";
import type {
  TweetCorpus,
  StyleStats,
  TaggedTweet,
  ClusterAnalysis,
  PersonaDocument,
} from "@groa/types";
import { Timestamp } from "@groa/types";
import type { BackendType, GroaConfig } from "@groa/config";
import { resolveStepConfig } from "@groa/config";
import { createLlmBackend, BatchClient } from "@groa/llm-client";
import {
  StepCacheManager,
  BUILD_STEP_ORDER,
  PipelineProgress,
} from "@groa/pipeline";
import type { BuildStepId } from "@groa/pipeline";
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
import { loadConfig } from "./config.js";
import { readJsonFile } from "./validate.js";
import { validateTweets, createProgressDisplay } from "./build.js";
import { ensureConsent } from "./consent.js";

/**
 * キャッシュからステップの出力を読み込む。
 * 依存関係チェック後に呼ばれるため存在が保証されているが、
 * 型安全のためエラーハンドリングも行う。
 */
async function readCachedOutput<T>(
  cache: StepCacheManager,
  stepName: string,
): Promise<T> {
  const cached = await cache.read(stepName);
  if (!cached) {
    throw new Error(
      `${stepName} の結果がありません。先に \`groa step ${stepName}\` を実行してください。`,
    );
  }
  return cached.output as T;
}

/** ステップの依存関係マップ（実行に必要な前段ステップ） */
const STEP_DEPENDENCIES: Record<BuildStepId, BuildStepId[]> = {
  preprocess: [],
  stats: ["preprocess"],
  classify: ["preprocess"],
  analyze: ["classify", "stats"],
  synthesize: ["analyze", "stats", "preprocess"],
  embed: ["preprocess"],
};

export function stepCommand(): Command {
  return new Command("step")
    .description("個別ステップを実行する")
    .argument(
      "<stepName>",
      "ステップ名 (preprocess | stats | classify | analyze | synthesize | embed)",
    )
    .argument(
      "[tweets]",
      "ツイートデータのJSONファイルパス (preprocess時は必須)",
    )
    .action(
      async (
        stepName: string,
        tweetsPath: string | undefined,
        _options: unknown,
        cmd: Command,
      ) => {
        const globalOpts = cmd.parent?.opts() ?? {};
        await runStepCommand(stepName, tweetsPath, {
          backend: globalOpts.backend as string | undefined,
          force: globalOpts.force as boolean | undefined,
          costLimit: globalOpts.costLimit as boolean | undefined,
        });
      },
    );
}

export async function runStepCommand(
  stepName: string,
  tweetsPath: string | undefined,
  options: {
    backend?: string;
    force?: boolean;
    costLimit?: boolean;
  } = {},
): Promise<void> {
  // 1. Validate step name
  if (!BUILD_STEP_ORDER.includes(stepName as BuildStepId)) {
    throw new Error(
      `不明なステップ名: ${stepName}\n有効なステップ: ${BUILD_STEP_ORDER.join(", ")}`,
    );
  }
  const step = stepName as BuildStepId;

  // 2. Load config
  const config = await loadConfig();
  if (options.backend) {
    config.backend = options.backend as BackendType;
  }

  // 3. Ensure consent for api backend on LLM steps
  const llmSteps: BuildStepId[] = [
    "classify",
    "analyze",
    "synthesize",
  ];
  if (config.backend === "api" && llmSteps.includes(step)) {
    await ensureConsent(config.cacheDir);
  }

  // 4. Set up cache and progress
  const cache = new StepCacheManager(config.cacheDir);
  const force = options.force ?? false;
  const costLimitUsd =
    options.costLimit === false ? null : config.costLimitUsd;

  const progress = new PipelineProgress({
    onProgress: createProgressDisplay(),
    costLimitUsd,
  });

  // 5. Validate dependencies are cached (except for preprocess)
  const deps = STEP_DEPENDENCIES[step];
  for (const dep of deps) {
    const cached = await cache.read(dep);
    if (!cached) {
      throw new Error(
        `${dep} の結果がありません。先に \`groa step ${dep}\` を実行してください。`,
      );
    }
  }

  // 6. Force invalidation of this step and downstream
  if (force) {
    await cache.invalidateFrom(step, [...BUILD_STEP_ORDER]);
  }

  // 7. Execute the step
  const stepIndex = BUILD_STEP_ORDER.indexOf(step);
  await executeSingleStep(
    step,
    stepIndex,
    config,
    cache,
    progress,
    force,
    tweetsPath,
  );
}

async function executeSingleStep(
  step: BuildStepId,
  stepIndex: number,
  config: GroaConfig,
  cache: StepCacheManager,
  progress: PipelineProgress,
  force: boolean,
  tweetsPath: string | undefined,
): Promise<void> {
  switch (step) {
    case "preprocess":
      await runPreprocessStep(
        stepIndex,
        config,
        cache,
        progress,
        force,
        tweetsPath,
      );
      break;
    case "stats":
      await runStatsStep(stepIndex, config, cache, progress, force);
      break;
    case "classify":
      await runClassifyStep(stepIndex, config, cache, progress, force);
      break;
    case "analyze":
      await runAnalyzeStep(stepIndex, config, cache, progress, force);
      break;
    case "synthesize":
      await runSynthesizeStep(stepIndex, config, cache, progress, force);
      break;
    case "embed":
      await runEmbedStep(stepIndex, config, cache, progress, force);
      break;
  }
}

async function runPreprocessStep(
  stepIndex: number,
  config: GroaConfig,
  cache: StepCacheManager,
  progress: PipelineProgress,
  force: boolean,
  tweetsPath: string | undefined,
): Promise<void> {
  if (!tweetsPath) {
    throw new Error(
      "preprocess ステップにはツイートデータのパスが必要です。",
    );
  }

  const rawJson = await readJsonFile(
    tweetsPath,
    "ツイートデータのJSONファイルを指定してください",
  );
  const tweets = validateTweets(rawJson);

  const inputHash = cache.computeHash({
    input: tweets,
    config: config.steps.preprocess,
  });
  const canSkip = await cache.shouldSkip("preprocess", inputHash, force);

  progress.stepStart("preprocess", stepIndex, BUILD_STEP_ORDER.length);

  if (canSkip) {
    const cached = await cache.read("preprocess");
    const costUsd = cached?.cost?.estimatedUsd ?? 0;
    progress.stepComplete(
      "preprocess",
      stepIndex,
      BUILD_STEP_ORDER.length,
      costUsd,
    );
    return;
  }

  const result = preprocess(tweets, {
    minTweetLength: config.steps.preprocess.minTweetLength,
    boilerplatePatterns: config.steps.preprocess.boilerplatePatterns,
  });
  await cache.write("preprocess", inputHash, result, null);
  progress.stepComplete(
    "preprocess",
    stepIndex,
    BUILD_STEP_ORDER.length,
    0,
  );
}

async function runStatsStep(
  stepIndex: number,
  _config: GroaConfig,
  cache: StepCacheManager,
  progress: PipelineProgress,
  force: boolean,
): Promise<void> {
  const corpus = await readCachedOutput<TweetCorpus>(cache, "preprocess");

  const inputHash = cache.computeHash({ corpus });
  const canSkip = await cache.shouldSkip("stats", inputHash, force);

  progress.stepStart("stats", stepIndex, BUILD_STEP_ORDER.length);

  if (canSkip) {
    const cached = await cache.read("stats");
    const costUsd = cached?.cost?.estimatedUsd ?? 0;
    progress.stepComplete(
      "stats",
      stepIndex,
      BUILD_STEP_ORDER.length,
      costUsd,
    );
    return;
  }

  const tokenizer = await getTokenizer();
  const texts = corpus.tweets.map((t) => t.text);
  const tokenized = corpus.tweets.map((t) => tokenizer.tokenize(t.text));
  const tokenizedWithIds = corpus.tweets.map((t, i) => ({
    id: t.id,
    tokens: tokenized[i] ?? [],
  }));

  const styleStats: StyleStats = {
    lengthDistribution: calcLengthDistribution(texts.map((t) => t.length)),
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

  await cache.write("stats", inputHash, styleStats, null);
  progress.stepComplete(
    "stats",
    stepIndex,
    BUILD_STEP_ORDER.length,
    0,
  );
}

async function runClassifyStep(
  stepIndex: number,
  config: GroaConfig,
  cache: StepCacheManager,
  progress: PipelineProgress,
  force: boolean,
): Promise<void> {
  const corpus = await readCachedOutput<TweetCorpus>(cache, "preprocess");

  const inputHash = cache.computeHash({
    corpus,
    classifyConfig: config.steps.classify,
  });
  const canSkip = await cache.shouldSkip("classify", inputHash, force);

  progress.stepStart("classify", stepIndex, BUILD_STEP_ORDER.length);

  if (canSkip) {
    const cached = await cache.read("classify");
    const costUsd = cached?.cost?.estimatedUsd ?? 0;
    progress.stepComplete(
      "classify",
      stepIndex,
      BUILD_STEP_ORDER.length,
      costUsd,
    );
    return;
  }

  const resolved = resolveStepConfig(config, "classify");
  const backend = createLlmBackend(resolved);
  const batchClient =
    resolved.backend === "api" && resolved.apiKey
      ? new BatchClient(resolved.apiKey, resolved.model)
      : null;
  const taggedTweets = await classify(corpus, backend, batchClient, {
    batchSize: config.steps.classify.batchSize,
  });

  await cache.write("classify", inputHash, taggedTweets, null);
  progress.stepComplete(
    "classify",
    stepIndex,
    BUILD_STEP_ORDER.length,
    0,
  );
}

async function runAnalyzeStep(
  stepIndex: number,
  config: GroaConfig,
  cache: StepCacheManager,
  progress: PipelineProgress,
  force: boolean,
): Promise<void> {
  const taggedTweets = await readCachedOutput<TaggedTweet[]>(cache, "classify");
  const styleStats = await readCachedOutput<StyleStats>(cache, "stats");

  const inputHash = cache.computeHash({ taggedTweets, styleStats });
  const canSkip = await cache.shouldSkip("analyze", inputHash, force);

  progress.stepStart("analyze", stepIndex, BUILD_STEP_ORDER.length);

  if (canSkip) {
    const cached = await cache.read("analyze");
    const costUsd = cached?.cost?.estimatedUsd ?? 0;
    progress.stepComplete(
      "analyze",
      stepIndex,
      BUILD_STEP_ORDER.length,
      costUsd,
    );
    return;
  }

  const resolved = resolveStepConfig(config, "analyze");
  const backend = createLlmBackend(resolved);
  const clusters = buildClusters(taggedTweets);
  const clustersWithStats = await computeAllClusterStats(clusters);
  const analyses = await analyzeClusters(clustersWithStats, backend);

  await cache.write("analyze", inputHash, analyses, null);
  progress.stepComplete(
    "analyze",
    stepIndex,
    BUILD_STEP_ORDER.length,
    0,
  );
}

async function runSynthesizeStep(
  stepIndex: number,
  config: GroaConfig,
  cache: StepCacheManager,
  progress: PipelineProgress,
  force: boolean,
): Promise<void> {
  const analyses = await readCachedOutput<ClusterAnalysis[]>(cache, "analyze");
  const styleStats = await readCachedOutput<StyleStats>(cache, "stats");
  const corpus = await readCachedOutput<TweetCorpus>(cache, "preprocess");

  const inputHash = cache.computeHash({
    analyses,
    styleStats,
    metadata: corpus.metadata,
  });
  const canSkip = await cache.shouldSkip("synthesize", inputHash, force);

  progress.stepStart("synthesize", stepIndex, BUILD_STEP_ORDER.length);

  if (canSkip) {
    const cached = await cache.read("synthesize");
    const costUsd = cached?.cost?.estimatedUsd ?? 0;
    progress.stepComplete(
      "synthesize",
      stepIndex,
      BUILD_STEP_ORDER.length,
      costUsd,
    );
    return;
  }

  const resolved = resolveStepConfig(config, "synthesize");
  const backend = createLlmBackend(resolved);
  const persona: PersonaDocument = await synthesize(
    analyses,
    styleStats,
    corpus.metadata,
    backend,
  );

  await cache.write("synthesize", inputHash, persona, null);
  progress.stepComplete(
    "synthesize",
    stepIndex,
    BUILD_STEP_ORDER.length,
    0,
  );
}

async function runEmbedStep(
  stepIndex: number,
  _config: GroaConfig,
  cache: StepCacheManager,
  progress: PipelineProgress,
  force: boolean,
): Promise<void> {
  const corpus = await readCachedOutput<TweetCorpus>(cache, "preprocess");

  const inputHash = cache.computeHash({ corpus });
  const canSkip = await cache.shouldSkip("embed", inputHash, force);

  progress.stepStart("embed", stepIndex, BUILD_STEP_ORDER.length);

  if (canSkip) {
    const cached = await cache.read("embed");
    const costUsd = cached?.cost?.estimatedUsd ?? 0;
    progress.stepComplete(
      "embed",
      stepIndex,
      BUILD_STEP_ORDER.length,
      costUsd,
    );
    return;
  }

  const embedder = await createEmbedder();
  const embeddingIndex = await generateEmbeddings(corpus, embedder);

  await cache.write("embed", inputHash, embeddingIndex, null);
  progress.stepComplete(
    "embed",
    stepIndex,
    BUILD_STEP_ORDER.length,
    0,
  );
}
