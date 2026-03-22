import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProgram } from "./index.js";
import { runInit, runInitInteractive } from "./commands/init.js";
import { loadConfig, runConfigSet } from "./commands/config.js";
import { runInspect } from "./commands/inspect.js";
import { runCost, collectCostSummary } from "./commands/cost.js";
import { runClean } from "./commands/clean.js";
import { assertFileExists, readJsonFile } from "./commands/validate.js";
import { hasConsent, saveConsent, ensureConsent } from "./commands/consent.js";
import { StepCacheManager } from "@groa/pipeline";
import { Timestamp, ModelIdString } from "@groa/types";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "groa-cli-test-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("createProgram", () => {
  it("groa コマンドのプログラムを作成する", () => {
    const program = createProgram();
    expect(program.name()).toBe("groa");
  });

  it("--version が 0.1.0 を返す", () => {
    const program = createProgram();
    expect(program.version()).toBe("0.1.0");
  });

  it("init サブコマンドが登録されている", () => {
    const program = createProgram();
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain("init");
  });

  it("config サブコマンドが登録されている", () => {
    const program = createProgram();
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain("config");
  });

  it("inspect サブコマンドが登録されている", () => {
    const program = createProgram();
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain("inspect");
  });

  it("cost サブコマンドが登録されている", () => {
    const program = createProgram();
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain("cost");
  });

  it("clean サブコマンドが登録されている", () => {
    const program = createProgram();
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain("clean");
  });

  it("--backend オプションが定義されている", () => {
    const program = createProgram();
    const options = program.options.map((o) => o.long);
    expect(options).toContain("--backend");
  });

  it("--force オプションが定義されている", () => {
    const program = createProgram();
    const options = program.options.map((o) => o.long);
    expect(options).toContain("--force");
  });

  it("--no-cost-limit オプションが定義されている", () => {
    const program = createProgram();
    const options = program.options.map((o) => o.long);
    expect(options).toContain("--no-cost-limit");
  });
});

describe("groa init", () => {
  it("groa.json の雛形を生成する", async () => {
    const filePath = await runInit("anthropic", testDir);

    const content = await readFile(filePath, "utf-8");
    const config = JSON.parse(content) as Record<string, unknown>;
    expect(config.backend).toBe("anthropic");
    expect(config.cacheDir).toBe(".groa");
    expect(config.costLimitUsd).toBe(10.0);
  });

  it("anthropic バックエンドで APIキー環境変数プレースホルダを設定する", async () => {
    await runInit("anthropic", testDir);
    const content = await readFile(
      join(testDir, "groa.json"),
      "utf-8",
    );
    const config = JSON.parse(content) as Record<string, unknown>;
    const apiKeys = config.apiKeys as Record<string, string>;
    expect(apiKeys.anthropic).toBe("${ANTHROPIC_API_KEY}");
  });

  it("claude-code バックエンドを選択できる", async () => {
    await runInit("claude-code", testDir);
    const content = await readFile(
      join(testDir, "groa.json"),
      "utf-8",
    );
    const config = JSON.parse(content) as Record<string, unknown>;
    expect(config.backend).toBe("claude-code");
  });

  it("既に groa.json が存在する場合はエラーを投げる", async () => {
    await runInit("anthropic", testDir);
    await expect(runInit("anthropic", testDir)).rejects.toThrow("既に存在します");
  });

  it("--models.* オプションでモデルIDを指定できる", async () => {
    await runInit("anthropic", testDir, {
      haiku: "claude-haiku-4-5-20251001",
      sonnet: "claude-sonnet-4-6-20250227",
    });
    const content = await readFile(
      join(testDir, "groa.json"),
      "utf-8",
    );
    const config = JSON.parse(content) as Record<string, unknown>;
    const models = config.models as Record<string, string | null>;
    expect(models.haiku).toBe("claude-haiku-4-5-20251001");
    expect(models.sonnet).toBe("claude-sonnet-4-6-20250227");
    expect(models.opus).toBeNull();
  });

  it("openrouter バックエンドで APIキー環境変数プレースホルダを設定する", async () => {
    await runInit("openrouter", testDir);
    const content = await readFile(
      join(testDir, "groa.json"),
      "utf-8",
    );
    const config = JSON.parse(content) as Record<string, unknown>;
    const apiKeys = config.apiKeys as Record<string, string>;
    expect(apiKeys.openrouter).toBe("${OPENROUTER_API_KEY}");
    expect(config.backend).toBe("openrouter");
  });
});

describe("groa init (interactive)", () => {
  function mockPrompt(answers: string[]) {
    return async (_question: string, defaultValue: string): Promise<string> => {
      const answer = answers.shift();
      return answer !== undefined && answer !== "" ? answer : defaultValue;
    };
  }

  it("対話モードで claude-code を選択するとティア名がデフォルト設定される", async () => {
    const prompt = mockPrompt(["claude-code", "", "", ""]);
    await runInitInteractive(testDir, prompt);

    const config = JSON.parse(await readFile(join(testDir, "groa.json"), "utf-8")) as Record<string, unknown>;
    expect(config.backend).toBe("claude-code");
    const models = config.models as Record<string, string | null>;
    expect(models.haiku).toBe("haiku");
    expect(models.sonnet).toBe("sonnet");
    expect(models.opus).toBe("opus");
  });

  it("対話モードでカスタムモデルを指定できる", async () => {
    const prompt = mockPrompt(["claude-code", "", "claude-sonnet-4-6-20250227", ""]);
    await runInitInteractive(testDir, prompt);

    const config = JSON.parse(await readFile(join(testDir, "groa.json"), "utf-8")) as Record<string, unknown>;
    const models = config.models as Record<string, string | null>;
    expect(models.haiku).toBe("haiku");
    expect(models.sonnet).toBe("claude-sonnet-4-6-20250227");
    expect(models.opus).toBe("opus");
  });

  it("対話モードで anthropic を選択した場合モデルは null のまま", async () => {
    const prompt = mockPrompt(["anthropic", "", "", ""]);
    await runInitInteractive(testDir, prompt);

    const config = JSON.parse(await readFile(join(testDir, "groa.json"), "utf-8")) as Record<string, unknown>;
    expect(config.backend).toBe("anthropic");
    const models = config.models as Record<string, string | null>;
    expect(models.haiku).toBeNull();
    expect(models.sonnet).toBeNull();
    expect(models.opus).toBeNull();
  });

  it("不正なバックエンド名でエラーを投げる", async () => {
    const prompt = mockPrompt(["invalid"]);
    await expect(runInitInteractive(testDir, prompt)).rejects.toThrow("不正なバックエンド");
  });
});

describe("groa config", () => {
  it("groa.json から設定を読み込む", async () => {
    await runInit("anthropic", testDir);
    const config = await loadConfig(testDir);

    expect(config.backend).toBe("anthropic");
    expect(config.costLimitUsd).toBe(10.0);
  });

  it("groa.json が存在しない場合はエラーを投げる", async () => {
    await expect(loadConfig(testDir)).rejects.toThrow(
      "groa.json が見つかりません",
    );
  });

  it("不正なJSONの場合はエラーを投げる", async () => {
    await writeFile(join(testDir, "groa.json"), "{ invalid json", "utf-8");

    await expect(loadConfig(testDir)).rejects.toThrow("JSON形式が不正です");
  });
});

describe("groa config set", () => {
  it("models.sonnet を更新できる", async () => {
    await runInit("anthropic", testDir);
    await runConfigSet("models.sonnet", "claude-sonnet-4-6-20250227", testDir);

    const config = await loadConfig(testDir);
    expect(config.models.sonnet).toBe("claude-sonnet-4-6-20250227");
  });

  it("models.haiku を更新できる", async () => {
    await runInit("anthropic", testDir);
    await runConfigSet("models.haiku", "claude-haiku-4-5-20251001", testDir);

    const config = await loadConfig(testDir);
    expect(config.models.haiku).toBe("claude-haiku-4-5-20251001");
  });

  it("backend を更新できる", async () => {
    await runInit("anthropic", testDir);
    await runConfigSet("backend", "openrouter", testDir);

    const config = await loadConfig(testDir);
    expect(config.backend).toBe("openrouter");
  });

  it("groa.json が存在しない場合はエラーを投げる", async () => {
    await expect(
      runConfigSet("models.sonnet", "test", testDir),
    ).rejects.toThrow("groa.json が見つかりません");
  });

  it("不正な backend 値はバリデーションエラー", async () => {
    await runInit("anthropic", testDir);
    await expect(
      runConfigSet("backend", "invalid-backend", testDir),
    ).rejects.toThrow("設定値が不正です");
  });
});

// --- groa inspect ---

describe("groa inspect", () => {
  it("PersonaDocument の内容をJSON文字列で返す", async () => {
    const cacheDir = join(testDir, ".groa");
    const cacheManager = new StepCacheManager(cacheDir);
    const persona = { body: "テストペルソナ", version: "1.0" };
    await cacheManager.write("synthesize", "hash123", persona);

    const result = await runInspect(testDir);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed.body).toBe("テストペルソナ");
    expect(parsed.version).toBe("1.0");
  });

  it("PersonaDocument が存在しない場合はアクション付きエラーを投げる", async () => {
    await expect(runInspect(testDir)).rejects.toThrow(
      "PersonaDocument が見つかりません",
    );
    await expect(runInspect(testDir)).rejects.toThrow("groa build");
  });
});

// --- groa cost ---

describe("groa cost", () => {
  it("キャッシュされたステップのコストを合計表示する", async () => {
    const cacheDir = join(testDir, ".groa");
    const cacheManager = new StepCacheManager(cacheDir);

    await cacheManager.write("classify", "h1", {}, {
      inputTokens: 100,
      outputTokens: 50,
      cachedTokens: 0,
      model: ModelIdString("claude-haiku-4-5-20251001"),
      estimatedUsd: 0.17,
    });
    await cacheManager.write("analyze", "h2", {}, {
      inputTokens: 200,
      outputTokens: 100,
      cachedTokens: 0,
      model: ModelIdString("claude-sonnet-4-6-20250227"),
      estimatedUsd: 1.5,
    });

    const result = await runCost(testDir);
    expect(result).toContain("classify");
    expect(result).toContain("analyze");
    expect(result).toContain("合計");
  });

  it("collectCostSummary で正確なコスト合計を取得できる", async () => {
    const cacheDir = join(testDir, ".groa");
    const cacheManager = new StepCacheManager(cacheDir);

    await cacheManager.write("classify", "h1", {}, {
      inputTokens: 100,
      outputTokens: 50,
      cachedTokens: 0,
      model: ModelIdString("claude-haiku-4-5-20251001"),
      estimatedUsd: 0.17,
    });
    await cacheManager.write("stats", "h2", {}, null);

    const steps = await cacheManager.listCachedSteps();
    const summary = await collectCostSummary(cacheManager, steps);

    expect(summary.totalUsd).toBeCloseTo(0.17);
    expect(summary.steps).toHaveLength(2);
  });

  it("キャッシュが存在しない場合はアクション付きエラーを投げる", async () => {
    await expect(runCost(testDir)).rejects.toThrow("キャッシュが見つかりません");
    await expect(runCost(testDir)).rejects.toThrow("groa build");
  });
});

// --- groa clean ---

describe("groa clean", () => {
  it("全キャッシュを削除する", async () => {
    const cacheDir = join(testDir, ".groa");
    const cacheManager = new StepCacheManager(cacheDir);
    await cacheManager.write("classify", "h1", {});
    await cacheManager.write("analyze", "h2", {});

    const result = await runClean(undefined, testDir);
    expect(result).toContain("2 件");

    const remaining = await cacheManager.listCachedSteps();
    expect(remaining).toHaveLength(0);
  });

  it("特定ステップ以降のキャッシュを連鎖削除する", async () => {
    const cacheDir = join(testDir, ".groa");
    const cacheManager = new StepCacheManager(cacheDir);
    await cacheManager.write("preprocess", "h0", {});
    await cacheManager.write("stats", "h1", {});
    await cacheManager.write("classify", "h2", {});
    await cacheManager.write("analyze", "h3", {});

    const result = await runClean("stats", testDir);
    expect(result).toContain("stats");

    // stats 以降 (stats, classify, analyze) が削除される
    const remaining = await cacheManager.listCachedSteps();
    expect(remaining).toContain("preprocess");
    expect(remaining).not.toContain("stats");
    expect(remaining).not.toContain("classify");
    expect(remaining).not.toContain("analyze");
  });

  it("存在しないステップ名でエラーを投げる", async () => {
    await expect(runClean("nonexistent", testDir)).rejects.toThrow(
      "キャッシュが見つかりません",
    );
  });

  it("削除するキャッシュがない場合はメッセージを返す", async () => {
    const result = await runClean(undefined, testDir);
    expect(result).toContain("削除するキャッシュがありません");
  });
});

// --- validate ---

describe("validate", () => {
  it("assertFileExists はファイルが存在すれば成功する", async () => {
    const filePath = join(testDir, "test.txt");
    await writeFile(filePath, "test", "utf-8");

    await expect(
      assertFileExists(filePath, "テスト"),
    ).resolves.toBeUndefined();
  });

  it("assertFileExists はファイルが存在しない場合アクション付きエラーを投げる", async () => {
    await expect(
      assertFileExists(join(testDir, "missing.txt"), "`groa init` で生成してください"),
    ).rejects.toThrow("ファイルが見つかりません");
    await expect(
      assertFileExists(join(testDir, "missing.txt"), "`groa init` で生成してください"),
    ).rejects.toThrow("groa init");
  });

  it("readJsonFile は有効なJSONを読み込む", async () => {
    const filePath = join(testDir, "data.json");
    await writeFile(filePath, '{"key": "value"}', "utf-8");

    const result = await readJsonFile(filePath, "アクション");
    expect(result).toEqual({ key: "value" });
  });

  it("readJsonFile は不正なJSONでエラーを投げる", async () => {
    const filePath = join(testDir, "bad.json");
    await writeFile(filePath, "not json", "utf-8");

    await expect(readJsonFile(filePath, "アクション")).rejects.toThrow(
      "JSON形式が不正です",
    );
  });

  it("readJsonFile はファイル不在でアクション付きエラーを投げる", async () => {
    await expect(
      readJsonFile(join(testDir, "missing.json"), "ファイルを確認してください"),
    ).rejects.toThrow("ファイルが見つかりません");
  });
});

// --- consent ---

describe("consent", () => {
  it("同意ファイルがなければ hasConsent は false を返す", async () => {
    const cacheDir = join(testDir, ".groa");
    expect(await hasConsent(cacheDir)).toBe(false);
  });

  it("saveConsent 後は hasConsent が true を返す", async () => {
    const cacheDir = join(testDir, ".groa");
    await saveConsent(cacheDir);
    expect(await hasConsent(cacheDir)).toBe(true);
  });

  it("ensureConsent は同意済みならプロンプトを表示しない", async () => {
    const cacheDir = join(testDir, ".groa");
    await saveConsent(cacheDir);

    const promptFn = async () => false; // 呼ばれたら false を返す
    await ensureConsent(cacheDir, promptFn); // エラーなし
  });

  it("ensureConsent はユーザーが y を返した場合に同意を保存する", async () => {
    const cacheDir = join(testDir, ".groa");
    const promptFn = async () => true;

    await ensureConsent(cacheDir, promptFn);
    expect(await hasConsent(cacheDir)).toBe(true);
  });

  it("ensureConsent はユーザーが拒否した場合にエラーを投げる", async () => {
    const cacheDir = join(testDir, ".groa");
    const promptFn = async () => false;

    await expect(ensureConsent(cacheDir, promptFn)).rejects.toThrow(
      "データ送信への同意が必要です",
    );
  });
});
