import { describe, it, expect, vi, beforeEach } from "vitest";
import { TweetId, Timestamp, ModelIdString } from "@groa/types";
import type {
  PersonaDocument,
  TaggedTweet,
  EmbeddingIndex,
  GeneratedText,
} from "@groa/types";

// --- Mocks ---

const mockRunGenerate = vi.fn();
const mockCacheRead = vi.fn();
vi.mock("@groa/pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@groa/pipeline")>();
  return {
    ...actual,
    runGenerate: (...args: unknown[]) => mockRunGenerate(...args),
    StepCacheManager: class {
      read = (...args: unknown[]) => mockCacheRead(...args);
    },
  };
});

const mockLoadConfig = vi.fn();
vi.mock("./config.js", () => ({
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
}));

const mockEnsureConsent = vi.fn();
vi.mock("./consent.js", () => ({
  ensureConsent: (...args: unknown[]) => mockEnsureConsent(...args),
}));

// --- Fixtures ---

const MOCK_PERSONA: PersonaDocument = {
  identity: { screenName: "test", overview: "テスト" },
  attitudes: [],
  styleGuide: { sentenceEndings: [], vocabulary: [], avoidances: [] },
  voiceBank: [],
  meta: {
    generatedAt: Timestamp(Date.now()),
    sourceCorpus: {
      totalCount: 10,
      dateRange: { start: Timestamp(1000000), end: Timestamp(2000000) },
      filteredCount: 0,
    },
    model: ModelIdString("test-model"),
  },
} as unknown as PersonaDocument;

const MOCK_TAGGED_TWEETS: TaggedTweet[] = [
  {
    id: TweetId("1"),
    text: "テストツイート",
    timestamp: Timestamp(Date.now()),
    isRetweet: false,
    hasMedia: false,
    replyTo: null,
    category: "opinion",
    sentiment: "positive",
  },
] as unknown as TaggedTweet[];

const MOCK_EMBEDDING_INDEX: EmbeddingIndex = {
  embeddings: [],
  model: ModelIdString("test-model"),
};

const MOCK_GENERATED_TEXT: GeneratedText = {
  text: "生成されたテキストです。",
  topic: "テスト",
  evaluation: {
    authenticity: 8.5,
    styleNaturalness: 7.0,
    attitudeConsistency: 9.0,
    rationale: "テスト評価",
  },
  fewShotIds: [TweetId("1")],
  modelUsed: ModelIdString("test-model"),
};

function createMockConfig() {
  return {
    backend: "anthropic" as "anthropic" | "openrouter" | "claude-code",
    apiKeys: { anthropic: "test-key" },
    claudeCode: { path: "claude", maxTurns: 1, maxBudgetUsd: null },
    models: {
      quick: "claude-haiku-4-5-20251001",
      standard: "claude-sonnet-4-6-20250227",
      deep: "claude-opus-4-6-20250313",
      embedding: "multilingual-e5-small",
    },
    steps: {
      preprocess: { minTweetLength: 5, boilerplatePatterns: [] },
      stats: {},
      classify: { model: null, apiKey: null, batchSize: 50 },
      analyze: {
        model: null,
        apiKey: null,
        minClusterSize: 50,
        maxClusterSize: 3000,
      },
      synthesize: { model: null, apiKey: null },
      embed: { model: null, apiKey: null },
      retrieve: {
        topK: 5,
        sentimentDiversity: true,
        categoryDiversity: true,
      },
      generate: {
        model: null,
        apiKey: null,
        defaultTemperature: 0.7,
        maxLength: 280,
        numVariants: 1,
      },
      evaluate: { model: null, apiKey: null, threshold: 6.0 },
    },
    cacheDir: ".groa",
    costLimitUsd: 10.0,
  };
}

function setupDefaultMocks() {
  mockLoadConfig.mockResolvedValue(createMockConfig());
  mockEnsureConsent.mockResolvedValue(undefined);
  mockCacheRead.mockImplementation((stepName: string) => {
    switch (stepName) {
      case "synthesize":
        return Promise.resolve({
          inputHash: "abc",
          output: MOCK_PERSONA,
          timestamp: Timestamp(Date.now()),
          cost: null,
        });
      case "classify":
        return Promise.resolve({
          inputHash: "def",
          output: MOCK_TAGGED_TWEETS,
          timestamp: Timestamp(Date.now()),
          cost: null,
        });
      case "embed":
        return Promise.resolve({
          inputHash: "ghi",
          output: MOCK_EMBEDDING_INDEX,
          timestamp: Timestamp(Date.now()),
          cost: null,
        });
      default:
        return Promise.resolve(null);
    }
  });
  mockRunGenerate.mockResolvedValue(MOCK_GENERATED_TEXT);
}

// --- Dynamic import ---

async function importGenerate() {
  return import("./generate.js");
}

// --- Tests ---

describe("generateCommand", () => {
  it("generate サブコマンドが正しく定義されている", async () => {
    const { generateCommand } = await importGenerate();
    const cmd = generateCommand();
    expect(cmd.name()).toBe("generate");
    expect(cmd.description()).toContain("テキストを生成する");
  });
});

describe("runGenerateCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("キャッシュから成果物を読み込み runGenerate を呼び出す", async () => {
    const { runGenerateCommand } = await importGenerate();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runGenerateCommand("AIの未来", { name: "test-build" });

    logSpy.mockRestore();
    writeSpy.mockRestore();

    expect(mockRunGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ backend: "anthropic" }),
      MOCK_PERSONA,
      MOCK_TAGGED_TWEETS,
      MOCK_EMBEDDING_INDEX,
      expect.objectContaining({
        topic: "AIの未来",
        temperature: 0.7,
        maxLength: 280,
        numVariants: 1,
        styleHint: null,
      }),
      expect.objectContaining({
        costLimitUsd: 10.0,
      }),
    );
  });

  it("--num-variants オプションが正しく渡される", async () => {
    const { runGenerateCommand } = await importGenerate();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runGenerateCommand("テスト", { name: "test-build", numVariants: 3 });

    logSpy.mockRestore();
    writeSpy.mockRestore();

    expect(mockRunGenerate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ numVariants: 3 }),
      expect.anything(),
    );
  });

  it("--temp オプションが正しく渡される", async () => {
    const { runGenerateCommand } = await importGenerate();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runGenerateCommand("テスト", { name: "test-build", temperature: 0.5 });

    logSpy.mockRestore();
    writeSpy.mockRestore();

    expect(mockRunGenerate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ temperature: 0.5 }),
      expect.anything(),
    );
  });

  it("--max-length オプションが正しく渡される", async () => {
    const { runGenerateCommand } = await importGenerate();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runGenerateCommand("テスト", { name: "test-build", maxLength: 500 });

    logSpy.mockRestore();
    writeSpy.mockRestore();

    expect(mockRunGenerate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ maxLength: 500 }),
      expect.anything(),
    );
  });

  it("--style-hint オプションが正しく渡される", async () => {
    const { runGenerateCommand } = await importGenerate();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runGenerateCommand("テスト", { name: "test-build", styleHint: "カジュアル" });

    logSpy.mockRestore();
    writeSpy.mockRestore();

    expect(mockRunGenerate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ styleHint: "カジュアル" }),
      expect.anything(),
    );
  });

  it("ビルド済みプロファイルが無い場合はエラーを投げる", async () => {
    const { runGenerateCommand } = await importGenerate();
    mockCacheRead.mockResolvedValue(null);

    await expect(runGenerateCommand("テスト", { name: "test-build" })).rejects.toThrow(
      "ビルド済みプロファイルが見つかりません",
    );
  });

  it("分類結果が無い場合はエラーを投げる", async () => {
    const { runGenerateCommand } = await importGenerate();
    mockCacheRead.mockImplementation((stepName: string) => {
      if (stepName === "synthesize") {
        return Promise.resolve({
          inputHash: "abc",
          output: MOCK_PERSONA,
          timestamp: Timestamp(Date.now()),
          cost: null,
        });
      }
      return Promise.resolve(null);
    });

    await expect(runGenerateCommand("テスト", { name: "test-build" })).rejects.toThrow(
      "分類結果が見つかりません",
    );
  });

  it("Embedding結果が無い場合はエラーを投げる", async () => {
    const { runGenerateCommand } = await importGenerate();
    mockCacheRead.mockImplementation((stepName: string) => {
      if (stepName === "synthesize") {
        return Promise.resolve({
          inputHash: "abc",
          output: MOCK_PERSONA,
          timestamp: Timestamp(Date.now()),
          cost: null,
        });
      }
      if (stepName === "classify") {
        return Promise.resolve({
          inputHash: "def",
          output: MOCK_TAGGED_TWEETS,
          timestamp: Timestamp(Date.now()),
          cost: null,
        });
      }
      return Promise.resolve(null);
    });

    await expect(runGenerateCommand("テスト", { name: "test-build" })).rejects.toThrow(
      "Embedding結果が見つかりません",
    );
  });

  it("評価スコア付きの結果を表示する", async () => {
    const { runGenerateCommand } = await importGenerate();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runGenerateCommand("テスト", { name: "test-build" });

    const calls = logSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContain("生成されたテキストです。");
    expect(calls).toContain("  authenticity: 8.5");
    expect(calls).toContain("  styleNaturalness: 7.0");
    expect(calls).toContain("  attitudeConsistency: 9.0");

    logSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it("複数バリアントが正しく表示される", async () => {
    const { runGenerateCommand } = await importGenerate();
    const variant1: GeneratedText = {
      ...MOCK_GENERATED_TEXT,
      text: "バリアント1",
    };
    const variant2: GeneratedText = {
      ...MOCK_GENERATED_TEXT,
      text: "バリアント2",
    };
    mockRunGenerate.mockResolvedValue([variant1, variant2]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runGenerateCommand("テスト", { name: "test-build", numVariants: 2 });

    const calls = logSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContain("--- Variant 1 ---");
    expect(calls).toContain("バリアント1");
    expect(calls).toContain("--- Variant 2 ---");
    expect(calls).toContain("バリアント2");

    logSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it("--backend オプションで設定を上書きする", async () => {
    const { runGenerateCommand } = await importGenerate();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runGenerateCommand("テスト", { name: "test-build", backend: "claude-code" });

    logSpy.mockRestore();
    writeSpy.mockRestore();

    expect(mockRunGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ backend: "claude-code" }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(mockEnsureConsent).not.toHaveBeenCalled();
  });

  it("--no-cost-limit で costLimitUsd が null になる", async () => {
    const { runGenerateCommand } = await importGenerate();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runGenerateCommand("テスト", { name: "test-build", costLimit: false });

    logSpy.mockRestore();
    writeSpy.mockRestore();

    expect(mockRunGenerate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ costLimitUsd: null }),
    );
  });
});

describe("createGenerateProgressDisplay", () => {
  it("step-start イベントでステップ名を表示する（インデックス+6）", async () => {
    const { createGenerateProgressDisplay } = await importGenerate();
    const display = createGenerateProgressDisplay();
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    display({
      type: "step-start",
      stepName: "retrieve",
      stepIndex: 0,
      totalSteps: 3,
    });

    expect(writeSpy).toHaveBeenCalledWith(
      "[Step 6] Retrieving similar tweets...",
    );
    writeSpy.mockRestore();
  });

  it("step-complete イベントでコストを表示する", async () => {
    const { createGenerateProgressDisplay } = await importGenerate();
    const display = createGenerateProgressDisplay();
    const logSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});

    display({
      type: "step-complete",
      stepName: "generate",
      stepIndex: 1,
      totalSteps: 3,
      costUsd: 0.05,
      totalCostUsd: 0.05,
    });

    expect(logSpy).toHaveBeenCalledWith(" [$0.05]");
    logSpy.mockRestore();
  });

  it("cost-limit-exceeded イベントでエラーメッセージを表示する", async () => {
    const { createGenerateProgressDisplay } = await importGenerate();
    const display = createGenerateProgressDisplay();
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    display({
      type: "cost-limit-exceeded",
      currentCostUsd: 10.5,
      limitUsd: 10.0,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("コスト上限に達しました"),
    );
    errorSpy.mockRestore();
  });
});

describe("displayResults", () => {
  it("評価なしの結果を表示する", async () => {
    const { displayResults } = await importGenerate();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result: GeneratedText = {
      ...MOCK_GENERATED_TEXT,
      evaluation: null,
    };
    displayResults(result);

    const calls = logSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContain("生成されたテキストです。");
    expect(calls).not.toContain(expect.stringContaining("authenticity"));

    logSpy.mockRestore();
  });
});
