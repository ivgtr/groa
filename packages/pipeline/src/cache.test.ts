import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ModelIdString } from "@groa/types";
import type { CostRecord } from "@groa/llm-client";
import { StepCacheManager } from "./cache.js";

let cacheDir: string;
let manager: StepCacheManager;

const MOCK_COST: CostRecord = {
  inputTokens: 100,
  outputTokens: 50,
  cachedTokens: 0,
  model: ModelIdString("claude-sonnet-4-6-20250227"),
  estimatedUsd: 0.002,
};

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "groa-cache-test-"));
  manager = new StepCacheManager(cacheDir);
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

describe("computeHash", () => {
  it("同一入力に対して同一ハッシュを返す", () => {
    const input = { tweets: ["hello", "world"], config: { model: "sonnet" } };
    const hash1 = manager.computeHash(input);
    const hash2 = manager.computeHash(input);
    expect(hash1).toBe(hash2);
  });

  it("異なる入力に対して異なるハッシュを返す", () => {
    const hash1 = manager.computeHash({ data: "a" });
    const hash2 = manager.computeHash({ data: "b" });
    expect(hash1).not.toBe(hash2);
  });

  it("SHA-256の64文字16進数文字列を返す", () => {
    const hash = manager.computeHash("test");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("ハッシュ計算時にAPIキーを除外する", () => {
    const withKey = { data: "test", apiKey: "sk-ant-xxx" };
    const withDifferentKey = { data: "test", apiKey: "sk-ant-yyy" };
    const hash1 = manager.computeHash(withKey);
    const hash2 = manager.computeHash(withDifferentKey);
    expect(hash1).toBe(hash2);
  });
});

describe("write / read", () => {
  it("ステップ出力をファイルに保存して読み込める", async () => {
    const output = { result: "テスト結果", count: 42 };
    await manager.write("preprocess", "abc123", output, MOCK_COST);

    const cached = await manager.read("preprocess");
    expect(cached).not.toBeNull();
    if (!cached) throw new Error("unreachable");
    expect(cached.inputHash).toBe("abc123");
    expect(cached.output).toEqual(output);
    expect(cached.cost).toEqual(MOCK_COST);
    expect(typeof cached.timestamp).toBe("number");
  });

  it("{cacheDir}/{stepName}.json のパスに保存する", async () => {
    await manager.write("stats", "hash123", { data: true });
    const content = await readFile(join(cacheDir, "stats.json"), "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed.inputHash).toBe("hash123");
  });

  it("存在しないステップの読み込みは null を返す", async () => {
    const cached = await manager.read("nonexistent");
    expect(cached).toBeNull();
  });

  it("cacheDir が存在しない場合でも自動作成して書き込める", async () => {
    const nestedDir = join(cacheDir, "sub", "dir");
    const nestedManager = new StepCacheManager(nestedDir);
    await nestedManager.write("step1", "hash", { ok: true });

    const cached = await nestedManager.read("step1");
    expect(cached).not.toBeNull();
  });
});

describe("APIキー保護", () => {
  it("出力にapiKeyフィールドがあれば [REDACTED] に置換して保存する", async () => {
    const output = { data: "test", apiKey: "sk-ant-secret" };
    await manager.write("step1", "hash", output);

    const content = await readFile(join(cacheDir, "step1.json"), "utf-8");
    expect(content).not.toContain("sk-ant-secret");
    expect(content).toContain("[REDACTED]");
  });

  it("ネストしたapiKeysフィールドも [REDACTED] に置換する", async () => {
    const output = { config: { apiKeys: { anthropic: "sk-ant-deep" } } };
    await manager.write("step2", "hash", output);

    const content = await readFile(join(cacheDir, "step2.json"), "utf-8");
    expect(content).not.toContain("sk-ant-deep");
  });

  it("stripSensitiveData をすり抜けたAPIキーが検出されたらエラーを投げる", async () => {
    // "token" フィールドは stripSensitiveData の対象外だが、
    // 値にAPIキーパターンが含まれている場合は assertNoApiKeys で検出される
    const output = { token: "sk-ant-api03-leaked-key-value" };
    await expect(
      manager.write("step3", "hash", output),
    ).rejects.toThrow("キャッシュにAPIキーが含まれています");
  });
});

describe("shouldSkip", () => {
  it("キャッシュが存在し、ハッシュが一致すればスキップする", async () => {
    await manager.write("preprocess", "abc123", { data: true });
    const skip = await manager.shouldSkip("preprocess", "abc123", false);
    expect(skip).toBe(true);
  });

  it("キャッシュが存在するが、ハッシュが異なればスキップしない", async () => {
    await manager.write("preprocess", "abc123", { data: true });
    const skip = await manager.shouldSkip("preprocess", "different", false);
    expect(skip).toBe(false);
  });

  it("キャッシュが存在しなければスキップしない", async () => {
    const skip = await manager.shouldSkip("preprocess", "abc123", false);
    expect(skip).toBe(false);
  });

  it("force=true ならキャッシュが存在してもスキップしない", async () => {
    await manager.write("preprocess", "abc123", { data: true });
    const skip = await manager.shouldSkip("preprocess", "abc123", true);
    expect(skip).toBe(false);
  });
});

describe("delete", () => {
  it("特定ステップのキャッシュを削除する", async () => {
    await manager.write("preprocess", "hash", { data: true });
    const success = await manager.delete("preprocess");

    expect(success).toBe(true);
    expect(await manager.read("preprocess")).toBeNull();
  });

  it("存在しないステップの削除は false を返す", async () => {
    const success = await manager.delete("nonexistent");
    expect(success).toBe(false);
  });
});

describe("deleteAll", () => {
  it("全キャッシュを削除する", async () => {
    await manager.write("preprocess", "h1", { a: 1 });
    await manager.write("stats", "h2", { b: 2 });
    await manager.write("classify", "h3", { c: 3 });

    await manager.deleteAll();

    expect(await manager.listCachedSteps()).toEqual([]);
  });
});

describe("invalidateFrom", () => {
  const stepOrder = [
    "preprocess",
    "stats",
    "classify",
    "analyze",
    "synthesize",
    "embed",
  ];

  it("指定ステップ以降のキャッシュを削除する", async () => {
    await manager.write("preprocess", "h1", { a: 1 });
    await manager.write("stats", "h2", { b: 2 });
    await manager.write("classify", "h3", { c: 3 });
    await manager.write("analyze", "h4", { d: 4 });

    const deleted = await manager.invalidateFrom("stats", stepOrder);

    expect(deleted).toContain("stats");
    expect(deleted).toContain("classify");
    expect(deleted).toContain("analyze");
    expect(deleted).not.toContain("preprocess");

    // preprocess は残っている
    expect(await manager.read("preprocess")).not.toBeNull();
    // stats 以降は削除されている
    expect(await manager.read("stats")).toBeNull();
    expect(await manager.read("classify")).toBeNull();
  });

  it("存在しないステップ名を指定すると空配列を返す", async () => {
    const deleted = await manager.invalidateFrom("unknown", stepOrder);
    expect(deleted).toEqual([]);
  });
});

describe("listCachedSteps", () => {
  it("キャッシュされているステップ名の一覧を返す", async () => {
    await manager.write("preprocess", "h1", { a: 1 });
    await manager.write("stats", "h2", { b: 2 });

    const steps = await manager.listCachedSteps();
    expect(steps).toContain("preprocess");
    expect(steps).toContain("stats");
  });

  it("cacheDir が存在しない場合は空配列を返す", async () => {
    const emptyManager = new StepCacheManager("/nonexistent/path");
    const steps = await emptyManager.listCachedSteps();
    expect(steps).toEqual([]);
  });
});
