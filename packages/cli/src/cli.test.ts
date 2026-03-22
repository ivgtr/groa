import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProgram } from "./index.js";
import { runInit } from "./commands/init.js";
import { loadConfig } from "./commands/config.js";

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
    const filePath = await runInit("api", testDir);

    const content = await readFile(filePath, "utf-8");
    const config = JSON.parse(content) as Record<string, unknown>;
    expect(config.backend).toBe("api");
    expect(config.cacheDir).toBe(".groa");
    expect(config.costLimitUsd).toBe(10.0);
  });

  it("api バックエンドで APIキー環境変数プレースホルダを設定する", async () => {
    await runInit("api", testDir);
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
    await runInit("api", testDir);
    await expect(runInit("api", testDir)).rejects.toThrow("既に存在します");
  });
});

describe("groa config", () => {
  it("groa.json から設定を読み込む", async () => {
    await runInit("api", testDir);
    const config = await loadConfig(testDir);

    expect(config.backend).toBe("api");
    expect(config.costLimitUsd).toBe(10.0);
  });

  it("groa.json が存在しない場合はエラーを投げる", async () => {
    await expect(loadConfig(testDir)).rejects.toThrow(
      "groa.json が見つかりません",
    );
  });

  it("不正なJSONの場合はエラーを投げる", async () => {
    const { writeFile: wf } = await import("node:fs/promises");
    await wf(join(testDir, "groa.json"), "{ invalid json", "utf-8");

    await expect(loadConfig(testDir)).rejects.toThrow("JSON形式が不正です");
  });
});
