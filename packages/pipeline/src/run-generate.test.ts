import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  PersonaDocument,
  TaggedTweet,
  EmbeddingIndex,
  GeneratedText,
  Tweet,
} from "@groa/types";
import { TweetId, Timestamp, ModelIdString } from "@groa/types";
import type { GroaConfig } from "@groa/config";
import { createDefaultConfig } from "@groa/config";
import type { StepEvent } from "./progress.js";

// --- Mocks ---

const mockRetrieve = vi.fn();
vi.mock("@groa/retrieve", () => ({
  retrieve: (...args: unknown[]) => mockRetrieve(...args),
}));

const mockGenerate = vi.fn();
vi.mock("@groa/generate", () => ({
  generate: (...args: unknown[]) => mockGenerate(...args),
}));

const mockEvaluate = vi.fn();
vi.mock("@groa/evaluate", () => ({
  evaluate: (...args: unknown[]) => mockEvaluate(...args),
}));

const mockCreateEmbedder = vi.fn();
vi.mock("@groa/embed", () => ({
  createEmbedder: () => mockCreateEmbedder(),
}));

const mockCreateLlmBackend = vi.fn();
vi.mock("@groa/llm-client", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createLlmBackend: (...args: unknown[]) => mockCreateLlmBackend(...args),
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
  makeTweet("3", "技術の話をしよう"),
  makeTweet("4", "今日の天気は良い"),
];

const MOCK_TAGGED: TaggedTweet[] = MOCK_TWEETS.map((tweet) => ({
  tweet,
  category: "opinion" as const,
  sentiment: "neutral" as const,
  topics: ["テスト"],
}));

const MOCK_PERSONA: PersonaDocument = {
  identity: { screenName: "test", overview: "テストユーザー" },
  attitudes: [],
  styleGuide: { sentenceEndings: [], vocabulary: [], avoidances: [] },
  voiceBank: [],
  meta: {
    generatedAt: Timestamp(Date.now()),
    sourceCorpus: {
      totalCount: 4,
      dateRange: { start: Timestamp(1000000), end: Timestamp(2000000) },
      filteredCount: 0,
    },
    model: ModelIdString("test-model"),
  },
} as unknown as PersonaDocument;

const MOCK_EMBEDDING_INDEX: EmbeddingIndex = {
  embeddings: [],
  model: ModelIdString("test-model"),
};

const MOCK_RETRIEVE_RESULT = {
  forGeneration: MOCK_TAGGED.slice(0, 2),
  forEvaluation: MOCK_TAGGED.slice(2, 4),
};

const MOCK_GENERATED_TEXT: GeneratedText = {
  text: "生成されたテキスト",
  topic: "テスト",
  evaluation: null,
  fewShotIds: [TweetId("1"), TweetId("2")],
  modelUsed: ModelIdString("test-model"),
};

const MOCK_EVALUATED_TEXT: GeneratedText = {
  ...MOCK_GENERATED_TEXT,
  evaluation: {
    authenticity: 8.0,
    styleConsistency: 7.5,
    topicRelevance: 9.0,
    overall: 8.2,
    feedback: "良い生成結果です",
  },
} as unknown as GeneratedText;

// --- Helper ---

function createTestConfig(): GroaConfig {
  const config = createDefaultConfig();
  config.models.quick = "test-haiku";
  config.models.standard = "test-sonnet";
  config.models.deep = "test-opus";
  config.cacheDir = "/tmp/groa-test-nonexistent-" + Date.now();
  return config;
}

const MOCK_BACKEND = {
  complete: vi.fn().mockResolvedValue({
    content: "{}",
    inputTokens: 0,
    outputTokens: 0,
    modelUsed: "test",
    cachedTokens: 0,
    costUsd: 0,
  }),
  backendType: () => "anthropic" as const,
};

const MOCK_EMBEDDER = {
  embed: vi.fn().mockResolvedValue([]),
  embedQuery: vi.fn().mockResolvedValue(new Float32Array(384)),
};

function setupAllMocks(): void {
  mockCreateEmbedder.mockResolvedValue(MOCK_EMBEDDER);
  mockCreateLlmBackend.mockReturnValue(MOCK_BACKEND);
  mockRetrieve.mockResolvedValue(MOCK_RETRIEVE_RESULT);
  mockGenerate.mockResolvedValue(MOCK_GENERATED_TEXT);
  mockEvaluate.mockResolvedValue(MOCK_EVALUATED_TEXT);
}

// --- Tests ---

async function importRunGenerate() {
  return import("./run-generate.js");
}

describe("runGenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAllMocks();
  });

  it("retrieve → generate → evaluate の順序で実行される", async () => {
    const { runGenerate } = await importRunGenerate();
    const config = createTestConfig();
    const callOrder: string[] = [];

    mockRetrieve.mockImplementation(async () => {
      callOrder.push("retrieve");
      return MOCK_RETRIEVE_RESULT;
    });
    mockGenerate.mockImplementation(async () => {
      callOrder.push("generate");
      return MOCK_GENERATED_TEXT;
    });
    mockEvaluate.mockImplementation(async () => {
      callOrder.push("evaluate");
      return MOCK_EVALUATED_TEXT;
    });

    await runGenerate(
      config,
      MOCK_PERSONA,
      MOCK_TAGGED,
      MOCK_EMBEDDING_INDEX,
      { topic: "テスト" },
      { costLimitUsd: null },
    );

    expect(callOrder).toEqual(["retrieve", "generate", "evaluate"]);
  });

  it("retrieve が正しいパラメータを受け取る", async () => {
    const { runGenerate } = await importRunGenerate();
    const config = createTestConfig();

    await runGenerate(
      config,
      MOCK_PERSONA,
      MOCK_TAGGED,
      MOCK_EMBEDDING_INDEX,
      { topic: "AI技術" },
      { costLimitUsd: null },
    );

    expect(mockRetrieve).toHaveBeenCalledWith(
      "AI技術",
      MOCK_EMBEDDING_INDEX,
      MOCK_TAGGED,
      MOCK_EMBEDDER,
      {
        topK: config.steps.retrieve.topK,
        sentimentDiversity: config.steps.retrieve.sentimentDiversity,
        categoryDiversity: config.steps.retrieve.categoryDiversity,
      },
    );
  });

  it("generate が persona, forGeneration, backend, params を受け取る", async () => {
    const { runGenerate } = await importRunGenerate();
    const config = createTestConfig();
    const params = { topic: "テスト", temperature: 0.8, numVariants: 1 };

    await runGenerate(
      config,
      MOCK_PERSONA,
      MOCK_TAGGED,
      MOCK_EMBEDDING_INDEX,
      params,
      { costLimitUsd: null },
    );

    expect(mockGenerate).toHaveBeenCalledWith(
      MOCK_PERSONA,
      MOCK_RETRIEVE_RESULT.forGeneration,
      expect.objectContaining({ inner: MOCK_BACKEND }),
      params,
    );
  });

  it("evaluate が生成テキスト, forEvaluation, persona, backend を受け取る", async () => {
    const { runGenerate } = await importRunGenerate();
    const config = createTestConfig();

    await runGenerate(
      config,
      MOCK_PERSONA,
      MOCK_TAGGED,
      MOCK_EMBEDDING_INDEX,
      { topic: "テスト" },
      { costLimitUsd: null },
    );

    expect(mockEvaluate).toHaveBeenCalledWith(
      MOCK_GENERATED_TEXT,
      MOCK_RETRIEVE_RESULT.forEvaluation,
      MOCK_PERSONA,
      expect.objectContaining({ inner: MOCK_BACKEND }),
    );
  });

  it("単一バリアント: evaluate が1回呼ばれ、単一の GeneratedText が返る", async () => {
    const { runGenerate } = await importRunGenerate();
    const config = createTestConfig();

    // generate が単一 GeneratedText を返す
    mockGenerate.mockResolvedValue(MOCK_GENERATED_TEXT);
    mockEvaluate.mockResolvedValue(MOCK_EVALUATED_TEXT);

    const result = await runGenerate(
      config,
      MOCK_PERSONA,
      MOCK_TAGGED,
      MOCK_EMBEDDING_INDEX,
      { topic: "テスト", numVariants: 1 },
      { costLimitUsd: null },
    );

    expect(mockEvaluate).toHaveBeenCalledTimes(1);
    expect(Array.isArray(result)).toBe(false);
    expect(result).toBe(MOCK_EVALUATED_TEXT);
  });

  it("複数バリアント (numVariants=3): evaluate が3回呼ばれ、GeneratedText[] が返る", async () => {
    const { runGenerate } = await importRunGenerate();
    const config = createTestConfig();

    const variants: GeneratedText[] = [
      { ...MOCK_GENERATED_TEXT, text: "バリアント1" },
      { ...MOCK_GENERATED_TEXT, text: "バリアント2" },
      { ...MOCK_GENERATED_TEXT, text: "バリアント3" },
    ];

    const evaluatedVariants: GeneratedText[] = variants.map((v) => ({
      ...v,
      evaluation: MOCK_EVALUATED_TEXT.evaluation,
    }));

    // generate が配列を返す
    mockGenerate.mockResolvedValue(variants);
    mockEvaluate
      .mockResolvedValueOnce(evaluatedVariants[0])
      .mockResolvedValueOnce(evaluatedVariants[1])
      .mockResolvedValueOnce(evaluatedVariants[2]);

    const result = await runGenerate(
      config,
      MOCK_PERSONA,
      MOCK_TAGGED,
      MOCK_EMBEDDING_INDEX,
      { topic: "テスト", numVariants: 3 },
      { costLimitUsd: null },
    );

    expect(mockEvaluate).toHaveBeenCalledTimes(3);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);

    // 各バリアントが個別に evaluate に渡される
    for (let i = 0; i < 3; i++) {
      expect(mockEvaluate).toHaveBeenNthCalledWith(
        i + 1,
        variants[i],
        MOCK_RETRIEVE_RESULT.forEvaluation,
        MOCK_PERSONA,
        expect.objectContaining({ inner: MOCK_BACKEND }),
      );
    }
  });

  it("retrieve でエラーが発生するとパイプラインが停止しエラーが伝搬する", async () => {
    const { runGenerate } = await importRunGenerate();
    const config = createTestConfig();

    const error = new Error("検索処理に失敗しました");
    mockRetrieve.mockRejectedValue(error);

    await expect(
      runGenerate(
        config,
        MOCK_PERSONA,
        MOCK_TAGGED,
        MOCK_EMBEDDING_INDEX,
        { topic: "テスト" },
        { costLimitUsd: null },
      ),
    ).rejects.toThrow("検索処理に失敗しました");

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it("generate でエラーが発生するとパイプラインが停止しエラーが伝搬する", async () => {
    const { runGenerate } = await importRunGenerate();
    const config = createTestConfig();

    const error = new Error("生成処理に失敗しました");
    mockGenerate.mockRejectedValue(error);

    await expect(
      runGenerate(
        config,
        MOCK_PERSONA,
        MOCK_TAGGED,
        MOCK_EMBEDDING_INDEX,
        { topic: "テスト" },
        { costLimitUsd: null },
      ),
    ).rejects.toThrow("生成処理に失敗しました");

    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it("evaluate でエラーが発生するとエラーが伝搬する", async () => {
    const { runGenerate } = await importRunGenerate();
    const config = createTestConfig();

    const error = new Error("評価処理に失敗しました");
    mockEvaluate.mockRejectedValue(error);

    await expect(
      runGenerate(
        config,
        MOCK_PERSONA,
        MOCK_TAGGED,
        MOCK_EMBEDDING_INDEX,
        { topic: "テスト" },
        { costLimitUsd: null },
      ),
    ).rejects.toThrow("評価処理に失敗しました");
  });

  it("進捗コールバックが正しく呼ばれる", async () => {
    const { runGenerate } = await importRunGenerate();
    const config = createTestConfig();
    const events: StepEvent[] = [];

    await runGenerate(
      config,
      MOCK_PERSONA,
      MOCK_TAGGED,
      MOCK_EMBEDDING_INDEX,
      { topic: "テスト" },
      {
        onProgress: (e) => events.push(e),
        costLimitUsd: null,
      },
    );

    const stepStarts = events.filter((e) => e.type === "step-start");
    const stepCompletes = events.filter((e) => e.type === "step-complete");
    const pipelineComplete = events.filter(
      (e) => e.type === "pipeline-complete",
    );

    expect(stepStarts).toHaveLength(3);
    expect(stepCompletes).toHaveLength(3);
    expect(pipelineComplete).toHaveLength(1);

    // step-start のステップ名が正しい順序
    expect(
      stepStarts.map((e) => {
        if (e.type === "step-start") return e.stepName;
        return "";
      }),
    ).toEqual(["retrieve", "generate", "evaluate"]);

    // stepIndex が 0〜2、totalSteps が 3
    for (let i = 0; i < 3; i++) {
      const start = stepStarts[i];
      if (start && start.type === "step-start") {
        expect(start.stepIndex).toBe(i);
        expect(start.totalSteps).toBe(3);
      }
    }

    // step-complete の stepIndex と totalSteps
    for (let i = 0; i < 3; i++) {
      const complete = stepCompletes[i];
      if (complete && complete.type === "step-complete") {
        expect(complete.stepIndex).toBe(i);
        expect(complete.totalSteps).toBe(3);
      }
    }
  });
});

describe("GENERATE_STEP_ORDER", () => {
  it("3ステップが定義されている", async () => {
    const { GENERATE_STEP_ORDER } = await importRunGenerate();
    expect(GENERATE_STEP_ORDER).toHaveLength(3);
    expect([...GENERATE_STEP_ORDER]).toEqual([
      "retrieve",
      "generate",
      "evaluate",
    ]);
  });
});
