import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TweetId, Timestamp, ModelIdString } from "@groa/types";
import type {
  Tweet,
  PersonaDocument,
  EmbeddingIndex,
} from "@groa/types";

// --- Mocks ---

const mockRunBuild = vi.fn();
vi.mock("@groa/pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@groa/pipeline")>();
  return {
    ...actual,
    runBuild: (...args: unknown[]) => mockRunBuild(...args),
  };
});

const mockLoadConfig = vi.fn();
vi.mock("./config.js", () => ({
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
}));

const mockReadJsonSource = vi.fn();
vi.mock("./validate.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./validate.js")>();
  return {
    ...actual,
    readJsonSource: (...args: unknown[]) => mockReadJsonSource(...args),
  };
});

const mockEnsureConsent = vi.fn();
vi.mock("./consent.js", () => ({
  ensureConsent: (...args: unknown[]) => mockEnsureConsent(...args),
}));

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

function makeTweets(count: number): Tweet[] {
  return Array.from({ length: count }, (_, i) =>
    makeTweet(String(i + 1), `テストツイート ${i + 1} の内容です。`),
  );
}

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

const MOCK_EMBEDDING_INDEX: EmbeddingIndex = {
  embeddings: [],
  model: ModelIdString("test-model"),
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
      analyze: { model: null, apiKey: null, minClusterSize: 50, maxClusterSize: 3000 },
      synthesize: { model: null, apiKey: null },
      embed: { model: null, apiKey: null },
      retrieve: { topK: 5, sentimentDiversity: true, categoryDiversity: true },
      generate: { model: null, apiKey: null, defaultTemperature: 0.7, maxLength: 280, numVariants: 1 },
      evaluate: { model: null, apiKey: null, threshold: 6.0 },
    },
    cacheDir: ".groa",
    costLimitUsd: 10.0,
  };
}

// --- Dynamic import ---

async function importBuild() {
  return import("./build.js");
}

// --- Tests ---

describe("validateTweets", () => {
  it("有効なツイート配列をバリデーションして返す", async () => {
    const { validateTweets } = await importBuild();
    const tweets = makeTweets(10);
    const result = validateTweets(tweets);
    expect(result).toHaveLength(10);
  });

  it("配列でない場合はエラーを投げる", async () => {
    const { validateTweets } = await importBuild();
    expect(() => validateTweets({ not: "array" })).toThrow(
      "配列形式である必要があります",
    );
  });

  it("10件未満の場合はエラーを投げる", async () => {
    const { validateTweets } = await importBuild();
    const tweets = makeTweets(5);
    expect(() => validateTweets(tweets)).toThrow("少なすぎます（5件）");
  });

  it("50,000件超の場合はエラーを投げる", async () => {
    const { validateTweets } = await importBuild();
    const raw = new Array(50001).fill(null);
    expect(() => validateTweets(raw)).toThrow("多すぎます（50001件）");
  });

  it("100件未満の場合は警告を出す", async () => {
    const { validateTweets } = await importBuild();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tweets = makeTweets(50);
    validateTweets(tweets);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("50件です"),
    );
    warnSpy.mockRestore();
  });

  it("不正なフォーマットのツイートがある場合はエラーを投げる", async () => {
    const { validateTweets } = await importBuild();
    const tweets = [
      ...makeTweets(9),
      { invalid: "tweet" },
    ];
    expect(() => validateTweets(tweets)).toThrow("フォーマットが不正です");
  });
});

describe("createProgressDisplay", () => {
  it("step-start イベントでステップ名を表示する", async () => {
    const { createProgressDisplay } = await importBuild();
    const display = createProgressDisplay({
      stepNames: {
        preprocess: "Preprocessing",
        stats: "Analyzing style",
        classify: "Classifying",
      },
    });
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    display({
      type: "step-start",
      stepName: "preprocess",
      stepIndex: 0,
      totalSteps: 6,
    });

    expect(writeSpy).toHaveBeenCalledWith(
      "[Step 0] Preprocessing...",
    );
    writeSpy.mockRestore();
  });

  it("step-complete イベントでコストを表示する", async () => {
    const { createProgressDisplay } = await importBuild();
    const display = createProgressDisplay({
      stepNames: {
        preprocess: "Preprocessing",
        stats: "Analyzing style",
        classify: "Classifying",
      },
    });
    const logSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});

    display({
      type: "step-complete",
      stepName: "classify",
      stepIndex: 2,
      totalSteps: 6,
      costUsd: 0.17,
      totalCostUsd: 0.17,
    });

    expect(logSpy).toHaveBeenCalledWith(" [$0.17]");
    logSpy.mockRestore();
  });

  it("pipeline-complete イベントで合計コストを表示する", async () => {
    const { createProgressDisplay } = await importBuild();
    const display = createProgressDisplay({
      stepNames: {
        preprocess: "Preprocessing",
        stats: "Analyzing style",
        classify: "Classifying",
      },
      pipelineCompleteMessage: "✓ Profile built.",
    });
    const logSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});

    display({
      type: "pipeline-complete",
      totalCostUsd: 2.17,
    });

    expect(logSpy).toHaveBeenCalledWith(
      "✓ Profile built. Total cost: $2.17",
    );
    logSpy.mockRestore();
  });

  it("cost-limit-exceeded イベントでエラーメッセージを表示する", async () => {
    const { createProgressDisplay } = await importBuild();
    const display = createProgressDisplay({
      stepNames: {
        preprocess: "Preprocessing",
        stats: "Analyzing style",
        classify: "Classifying",
      },
    });
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

describe("runBuildCommand", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "groa-build-test-"));
    vi.clearAllMocks();

    const config = createMockConfig();
    mockLoadConfig.mockResolvedValue(config);
    mockEnsureConsent.mockResolvedValue(undefined);
    mockRunBuild.mockResolvedValue({
      persona: MOCK_PERSONA,
      embeddingIndex: MOCK_EMBEDDING_INDEX,
    });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("ツイートファイルを読み込み runBuild を呼び出す", async () => {
    const { runBuildCommand } = await importBuild();
    const tweets = makeTweets(10);
    mockReadJsonSource.mockResolvedValue(tweets);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runBuildCommand("tweets.json", { name: "test-build" });
    logSpy.mockRestore();

    expect(mockReadJsonSource).toHaveBeenCalledWith(
      "tweets.json",
      "ツイートデータのファイル (.json, .js) またはURLを指定してください",
    );
    expect(mockRunBuild).toHaveBeenCalledWith(
      expect.objectContaining({ backend: "anthropic" }),
      tweets,
      expect.objectContaining({
        force: false,
        costLimitUsd: 10.0,
      }),
    );
  });

  it("--backend オプションで設定を上書きする", async () => {
    const { runBuildCommand } = await importBuild();
    const tweets = makeTweets(10);
    mockReadJsonSource.mockResolvedValue(tweets);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runBuildCommand("tweets.json", { name: "test-build", backend: "claude-code" });
    logSpy.mockRestore();

    expect(mockRunBuild).toHaveBeenCalledWith(
      expect.objectContaining({ backend: "claude-code" }),
      tweets,
      expect.anything(),
    );
  });

  it("--force オプションが runBuild に渡される", async () => {
    const { runBuildCommand } = await importBuild();
    const tweets = makeTweets(10);
    mockReadJsonSource.mockResolvedValue(tweets);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runBuildCommand("tweets.json", { name: "test-build", force: true });
    logSpy.mockRestore();

    expect(mockRunBuild).toHaveBeenCalledWith(
      expect.anything(),
      tweets,
      expect.objectContaining({ force: true }),
    );
  });

  it("--no-cost-limit で costLimitUsd が null になる", async () => {
    const { runBuildCommand } = await importBuild();
    const tweets = makeTweets(10);
    mockReadJsonSource.mockResolvedValue(tweets);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runBuildCommand("tweets.json", { name: "test-build", costLimit: false });
    logSpy.mockRestore();

    expect(mockRunBuild).toHaveBeenCalledWith(
      expect.anything(),
      tweets,
      expect.objectContaining({ costLimitUsd: null }),
    );
  });

  it("anthropic バックエンドで ensureConsent がベースの cacheDir で呼ばれる", async () => {
    const { runBuildCommand } = await importBuild();
    const tweets = makeTweets(10);
    mockReadJsonSource.mockResolvedValue(tweets);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runBuildCommand("tweets.json", { name: "test-build" });
    logSpy.mockRestore();

    // ensureConsent はベースの cacheDir（mutation 前）で呼ばれる
    expect(mockEnsureConsent).toHaveBeenCalledWith(".groa");
  });

  it("runBuild に渡される config.cacheDir に name が反映される", async () => {
    const { runBuildCommand } = await importBuild();
    const tweets = makeTweets(10);
    mockReadJsonSource.mockResolvedValue(tweets);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runBuildCommand("tweets.json", { name: "my-profile" });
    logSpy.mockRestore();

    expect(mockRunBuild).toHaveBeenCalledWith(
      expect.objectContaining({ cacheDir: ".groa/my-profile" }),
      tweets,
      expect.anything(),
    );
  });

  it("claude-code バックエンドでは ensureConsent が呼ばれない", async () => {
    const { runBuildCommand } = await importBuild();
    const tweets = makeTweets(10);
    mockReadJsonSource.mockResolvedValue(tweets);

    const config = createMockConfig();
    config.backend = "claude-code";
    mockLoadConfig.mockResolvedValue(config);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runBuildCommand("tweets.json", { name: "test-build" });
    logSpy.mockRestore();

    expect(mockEnsureConsent).not.toHaveBeenCalled();
  });

  it("Backend 情報がコンソールに表示される", async () => {
    const { runBuildCommand } = await importBuild();
    const tweets = makeTweets(10);
    mockReadJsonSource.mockResolvedValue(tweets);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runBuildCommand("tweets.json", { name: "test-build" });

    expect(logSpy).toHaveBeenCalledWith("Backend: anthropic");
    logSpy.mockRestore();
  });

  it("不正なツイートデータでエラーを投げる", async () => {
    const { runBuildCommand } = await importBuild();
    mockReadJsonSource.mockResolvedValue({ not: "array" });

    await expect(runBuildCommand("tweets.json", { name: "test-build" })).rejects.toThrow(
      "配列形式である必要があります",
    );
  });

  it("ツイートが少なすぎる場合はエラーを投げる", async () => {
    const { runBuildCommand } = await importBuild();
    mockReadJsonSource.mockResolvedValue(makeTweets(5));

    await expect(runBuildCommand("tweets.json", { name: "test-build" })).rejects.toThrow(
      "少なすぎます",
    );
  });
});

describe("buildCommand", () => {
  it("build サブコマンドが正しく定義されている", async () => {
    const { buildCommand } = await importBuild();
    const cmd = buildCommand();
    expect(cmd.name()).toBe("build");
    expect(cmd.description()).toContain("プロファイルを構築する");
  });
});
