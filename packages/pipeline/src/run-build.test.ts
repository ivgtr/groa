import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Tweet, TweetCorpus, TaggedTweet, StyleStats, ClusterAnalysis, PersonaDocument, EmbeddingIndex, TopicCluster } from "@groa/types";
import { TweetId, Timestamp, ModelIdString } from "@groa/types";
import type { GroaConfig } from "@groa/config";
import { createDefaultConfig } from "@groa/config";
import type { StepEvent } from "./progress.js";

// --- Mocks ---

const mockPreprocess = vi.fn<(tweets: Tweet[], opts?: unknown) => TweetCorpus>();
vi.mock("@groa/preprocess", () => ({
  preprocess: (...args: unknown[]) => mockPreprocess(...args as [Tweet[], unknown]),
}));

const mockGetTokenizer = vi.fn();
const mockCalcLengthDistribution = vi.fn();
const mockCalcCharTypeRatio = vi.fn();
const mockExtractPunctuation = vi.fn();
const mockExtractSentenceEndings = vi.fn();
const mockExtractTopTokens = vi.fn();
const mockExtractNgrams = vi.fn();
const mockExtractTopEmoji = vi.fn();
const mockCalcHourlyDistribution = vi.fn();
const mockCalcLineBreaks = vi.fn();
const mockCalcSharingRate = vi.fn();
const mockCalcReplyRate = vi.fn();

vi.mock("@groa/stats", () => ({
  getTokenizer: () => mockGetTokenizer(),
  calcLengthDistribution: (...args: unknown[]) => mockCalcLengthDistribution(...args),
  calcCharTypeRatio: (...args: unknown[]) => mockCalcCharTypeRatio(...args),
  extractPunctuation: (...args: unknown[]) => mockExtractPunctuation(...args),
  extractSentenceEndings: (...args: unknown[]) => mockExtractSentenceEndings(...args),
  extractTopTokens: (...args: unknown[]) => mockExtractTopTokens(...args),
  extractNgrams: (...args: unknown[]) => mockExtractNgrams(...args),
  extractTopEmoji: (...args: unknown[]) => mockExtractTopEmoji(...args),
  calcHourlyDistribution: (...args: unknown[]) => mockCalcHourlyDistribution(...args),
  calcLineBreaks: (...args: unknown[]) => mockCalcLineBreaks(...args),
  calcSharingRate: (...args: unknown[]) => mockCalcSharingRate(...args),
  calcReplyRate: (...args: unknown[]) => mockCalcReplyRate(...args),
}));

const mockClassify = vi.fn<(...args: unknown[]) => Promise<TaggedTweet[]>>();
vi.mock("@groa/classify", () => ({
  classify: (...args: unknown[]) => mockClassify(...args),
}));

const mockBuildClusters = vi.fn<(tagged: TaggedTweet[]) => TopicCluster[]>();
const mockComputeAllClusterStats = vi.fn();
const mockAnalyzeClusters = vi.fn<(...args: unknown[]) => Promise<ClusterAnalysis[]>>();
const mockMergeClusterAnalyses = vi.fn<(...args: unknown[]) => Promise<ClusterAnalysis[]>>();

vi.mock("@groa/analyze", () => ({
  buildClusters: (...args: unknown[]) => mockBuildClusters(...args as [TaggedTweet[]]),
  computeAllClusterStats: (...args: unknown[]) => mockComputeAllClusterStats(...args),
  analyzeClusters: (...args: unknown[]) => mockAnalyzeClusters(...args),
  mergeClusterAnalyses: (...args: unknown[]) => mockMergeClusterAnalyses(...args),
}));

const mockSynthesize = vi.fn<(...args: unknown[]) => Promise<PersonaDocument>>();
vi.mock("@groa/synthesize", () => ({
  synthesize: (...args: unknown[]) => mockSynthesize(...args),
}));

const mockCreateEmbedder = vi.fn();
const mockGenerateEmbeddings = vi.fn<(...args: unknown[]) => Promise<EmbeddingIndex>>();

vi.mock("@groa/embed", () => ({
  createEmbedder: () => mockCreateEmbedder(),
  generateEmbeddings: (...args: unknown[]) => mockGenerateEmbeddings(...args),
  deserializeEmbeddingIndex: (data: unknown) => data,
}));

const mockCreateLlmBackend = vi.fn();
vi.mock("@groa/llm-client", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createLlmBackend: (...args: unknown[]) => mockCreateLlmBackend(...args),
    BatchClient: vi.fn(),
  };
});

vi.mock("@groa/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@groa/config")>();
  return {
    ...actual,
    resolveStepConfig: vi.fn(actual.resolveStepConfig),
  };
});

// --- Fixtures ---

function makeTweet(id: string, text: string): Tweet {
  return {
    id: TweetId(id),
    text,
    timestamp: Timestamp(Date.now()),
    isRetweet: false,
    hasMedia: false,
    replyTo: null,
  };
}

const MOCK_TWEETS: Tweet[] = [
  makeTweet("1", "こんにちは世界"),
  makeTweet("2", "テストツイート"),
];

const MOCK_CORPUS: TweetCorpus = {
  tweets: MOCK_TWEETS,
  metadata: {
    totalCount: 2,
    dateRange: {
      start: Timestamp(1000000),
      end: Timestamp(2000000),
    },
    filteredCount: 0,
  },
};

const MOCK_STYLE_STATS: StyleStats = {
  lengthDistribution: { mean: 10, median: 10, p25: 5, p75: 15, min: 3, max: 20 },
  punctuation: { commaRate: 0.1, periodRate: 0.2, exclamationRate: 0.05, questionRate: 0.05 },
  sentenceEndings: [],
  charTypeRatio: { hiragana: 0.3, katakana: 0.1, kanji: 0.2, ascii: 0.3, other: 0.1 },
  topEmoji: [],
  topTokens: [],
  topNgrams: { bigrams: [], trigrams: [] },
  hourlyDistribution: new Array(24).fill(0) as number[],
  lineBreaks: { singleLineRate: 0.8, avgLines: 1.2 },
  sharingRate: { urlRate: 0.1, mediaRate: 0.05 },
  replyRate: 0.2,
  sampleSize: 2,
  analyzedAt: Timestamp(Date.now()),
} as unknown as StyleStats;

const MOCK_TAGGED: TaggedTweet[] = MOCK_TWEETS.map((tweet) => ({
  tweet,
  category: "opinion" as const,
  sentiment: "neutral" as const,
  topics: ["テスト"],
}));

const MOCK_ANALYSES: ClusterAnalysis[] = [
  {
    cluster: {
      category: "opinion",
      tweets: MOCK_TAGGED,
      tweetCount: MOCK_TAGGED.length,
    },
    attitudePatterns: [],
    thematicSummary: "テストサマリ",
    representativeQuotes: [],
  } as unknown as ClusterAnalysis,
];

const MOCK_PERSONA: PersonaDocument = {
  identity: { screenName: "test", overview: "テスト" },
  attitudes: [],
  styleGuide: { sentenceEndings: [], vocabulary: [], avoidances: [] },
  voiceBank: [],
  meta: {
    generatedAt: Timestamp(Date.now()),
    sourceCorpus: MOCK_CORPUS.metadata,
    model: ModelIdString("test-model"),
  },
} as unknown as PersonaDocument;

const MOCK_EMBEDDING_INDEX: EmbeddingIndex = {
  embeddings: [],
  model: ModelIdString("test-model"),
};

// --- Helper ---

function createTestConfig(): GroaConfig {
  const config = createDefaultConfig();
  config.models.quick = "test-haiku";
  config.models.standard = "test-sonnet";
  config.models.deep = "test-opus";
  config.cacheDir = "/tmp/groa-test-nonexistent-" + Date.now();
  return config;
}

function setupAllMocks(): void {
  // preprocess
  mockPreprocess.mockReturnValue(MOCK_CORPUS);

  // stats
  const mockTokenizer = { tokenize: vi.fn().mockReturnValue([]) };
  mockGetTokenizer.mockResolvedValue(mockTokenizer);
  mockCalcLengthDistribution.mockReturnValue(MOCK_STYLE_STATS.lengthDistribution);
  mockCalcCharTypeRatio.mockReturnValue(MOCK_STYLE_STATS.charTypeRatio);
  mockExtractPunctuation.mockReturnValue(MOCK_STYLE_STATS.punctuation);
  mockExtractSentenceEndings.mockReturnValue([]);
  mockExtractTopTokens.mockReturnValue([]);
  mockExtractNgrams.mockReturnValue({ bigrams: [], trigrams: [] });
  mockExtractTopEmoji.mockReturnValue([]);
  mockCalcHourlyDistribution.mockReturnValue(new Array(24).fill(0));
  mockCalcLineBreaks.mockReturnValue({ singleLineRate: 0.8, avgLines: 1.2 });
  mockCalcSharingRate.mockReturnValue({ urlRate: 0.1, mediaRate: 0.05 });
  mockCalcReplyRate.mockReturnValue(0.2);

  // classify
  mockClassify.mockResolvedValue(MOCK_TAGGED);

  // analyze
  mockBuildClusters.mockReturnValue([]);
  mockComputeAllClusterStats.mockResolvedValue([]);
  mockAnalyzeClusters.mockResolvedValue(MOCK_ANALYSES);
  mockMergeClusterAnalyses.mockImplementation(
    async (analyses: unknown) => analyses as ClusterAnalysis[],
  );

  // synthesize
  mockSynthesize.mockResolvedValue(MOCK_PERSONA);

  // embed
  const mockEmbedder = { embed: vi.fn().mockResolvedValue([]), embedQuery: vi.fn() };
  mockCreateEmbedder.mockResolvedValue(mockEmbedder);
  mockGenerateEmbeddings.mockResolvedValue(MOCK_EMBEDDING_INDEX);

  // llm-client
  mockCreateLlmBackend.mockReturnValue({
    complete: vi.fn().mockResolvedValue({ content: "{}", inputTokens: 0, outputTokens: 0, modelUsed: "test", cachedTokens: 0, costUsd: 0 }),
    backendType: () => "anthropic",
  });
}

// --- Tests ---

// 動的インポートで vi.mock が適用された run-build を取得
async function importRunBuild() {
  return import("./run-build.js");
}

describe("runBuild", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAllMocks();
  });

  it("全6ステップが正しい順序で実行される", async () => {
    const { runBuild } = await importRunBuild();
    const config = createTestConfig();
    const callOrder: string[] = [];

    mockPreprocess.mockImplementation(() => {
      callOrder.push("preprocess");
      return MOCK_CORPUS;
    });
    mockGetTokenizer.mockImplementation(async () => {
      callOrder.push("stats");
      return { tokenize: vi.fn().mockReturnValue([]) };
    });
    mockClassify.mockImplementation(async () => {
      callOrder.push("classify");
      return MOCK_TAGGED;
    });
    mockAnalyzeClusters.mockImplementation(async () => {
      callOrder.push("analyze");
      return MOCK_ANALYSES;
    });
    mockSynthesize.mockImplementation(async () => {
      callOrder.push("synthesize");
      return MOCK_PERSONA;
    });
    mockGenerateEmbeddings.mockImplementation(async () => {
      callOrder.push("embed");
      return MOCK_EMBEDDING_INDEX;
    });

    await runBuild(config, MOCK_TWEETS);

    expect(callOrder).toEqual([
      "preprocess",
      "stats",
      "classify",
      "analyze",
      "synthesize",
      "embed",
    ]);
  });

  it("BuildResult に persona と embeddingIndex が含まれる", async () => {
    const { runBuild } = await importRunBuild();
    const config = createTestConfig();

    const result = await runBuild(config, MOCK_TWEETS);

    expect(result.persona).toBe(MOCK_PERSONA);
    expect(result.embeddingIndex).toBe(MOCK_EMBEDDING_INDEX);
  });

  it("各ステップで step-start と step-complete の進捗コールバックが呼ばれる", async () => {
    const { runBuild } = await importRunBuild();
    const config = createTestConfig();
    const events: StepEvent[] = [];

    await runBuild(config, MOCK_TWEETS, {
      onProgress: (e) => events.push(e),
      costLimitUsd: null,
    });

    const stepStarts = events.filter((e) => e.type === "step-start");
    const stepCompletes = events.filter((e) => e.type === "step-complete");
    const pipelineComplete = events.filter((e) => e.type === "pipeline-complete");

    expect(stepStarts).toHaveLength(6);
    expect(stepCompletes).toHaveLength(6);
    expect(pipelineComplete).toHaveLength(1);

    // step-start のステップ名が正しい順序
    expect(stepStarts.map((e) => {
      if (e.type === "step-start") return e.stepName;
      return "";
    })).toEqual([
      "preprocess", "stats", "classify", "analyze", "synthesize", "embed",
    ]);

    // stepIndex が 0〜5
    for (let i = 0; i < 6; i++) {
      const start = stepStarts[i];
      if (start && start.type === "step-start") {
        expect(start.stepIndex).toBe(i);
        expect(start.totalSteps).toBe(6);
      }
    }
  });

  it("ステップでエラーが発生するとパイプラインが停止しエラーが伝搬する", async () => {
    const { runBuild } = await importRunBuild();
    const config = createTestConfig();

    const error = new Error("分類処理に失敗しました");
    mockClassify.mockRejectedValue(error);

    await expect(runBuild(config, MOCK_TWEETS, { costLimitUsd: null }))
      .rejects.toThrow("分類処理に失敗しました");

    // classify 以降のステップは実行されない
    expect(mockAnalyzeClusters).not.toHaveBeenCalled();
    expect(mockSynthesize).not.toHaveBeenCalled();
    expect(mockGenerateEmbeddings).not.toHaveBeenCalled();
  });

  it("preprocess の結果が後続ステップに渡される", async () => {
    const { runBuild } = await importRunBuild();
    const config = createTestConfig();

    await runBuild(config, MOCK_TWEETS, { costLimitUsd: null });

    // classify は corpus を第1引数に受け取る
    expect(mockClassify).toHaveBeenCalled();
    const classifyArgs = mockClassify.mock.calls[0] ?? [];
    expect(classifyArgs[0]).toBe(MOCK_CORPUS);
    // classifyArgs[1] = backend, classifyArgs[2] = batchClient (null or BatchClient)
    expect(classifyArgs[3]).toEqual(expect.objectContaining({ batchSize: 50 }));
  });

  it("analyze は classify と stats の結果を使う", async () => {
    const { runBuild } = await importRunBuild();
    const config = createTestConfig();

    await runBuild(config, MOCK_TWEETS, { costLimitUsd: null });

    // buildClusters は taggedTweets を受け取る
    expect(mockBuildClusters).toHaveBeenCalledWith(MOCK_TAGGED);
  });

  it("synthesize は analyses, styleStats, metadata を受け取る", async () => {
    const { runBuild } = await importRunBuild();
    const config = createTestConfig();

    await runBuild(config, MOCK_TWEETS, { costLimitUsd: null });

    expect(mockSynthesize).toHaveBeenCalledWith(
      MOCK_ANALYSES,
      expect.anything(), // styleStats（モック化されているため完全一致は難しい）
      MOCK_CORPUS.metadata,
      expect.anything(), // backend
    );
  });

  it("embed は corpus を使って embeddings を生成する", async () => {
    const { runBuild } = await importRunBuild();
    const config = createTestConfig();

    await runBuild(config, MOCK_TWEETS, { costLimitUsd: null });

    expect(mockCreateEmbedder).toHaveBeenCalled();
    expect(mockGenerateEmbeddings).toHaveBeenCalledWith(
      MOCK_CORPUS,
      expect.anything(), // embedder
    );
  });
});

describe("BUILD_STEP_ORDER", () => {
  it("6ステップが定義されている", async () => {
    const { BUILD_STEP_ORDER } = await importRunBuild();
    expect(BUILD_STEP_ORDER).toHaveLength(6);
    expect([...BUILD_STEP_ORDER]).toEqual([
      "preprocess", "stats", "classify", "analyze", "synthesize", "embed",
    ]);
  });
});
