import { describe, it, expect } from "vitest";
import { createDefaultConfig } from "./schema.js";
import { resolveStepConfig, checkConfigPermissions } from "./resolve.js";
import { GroaConfigSchema } from "./schema.js";

describe("resolveStepConfig", () => {
  describe("api バックエンド", () => {
    it("環境変数 ANTHROPIC_API_KEY をフォールバックとして使用する", () => {
      const config = createDefaultConfig();
      const resolved = resolveStepConfig(config, "classify", {
        ANTHROPIC_API_KEY: "sk-env-key",
      });
      expect(resolved.backend).toBe("api");
      expect(resolved.apiKey).toBe("sk-env-key");
    });

    it("グローバル apiKeys.anthropic が環境変数より優先される", () => {
      const config = GroaConfigSchema.parse({
        apiKeys: { anthropic: "sk-global" },
      });
      const resolved = resolveStepConfig(config, "classify", {
        ANTHROPIC_API_KEY: "sk-env",
      });
      expect(resolved.apiKey).toBe("sk-global");
    });

    it("工程別 apiKey が最優先される", () => {
      const config = GroaConfigSchema.parse({
        apiKeys: { anthropic: "sk-global" },
        steps: { classify: { apiKey: "sk-step" } },
      });
      const resolved = resolveStepConfig(config, "classify", {
        ANTHROPIC_API_KEY: "sk-env",
      });
      expect(resolved.apiKey).toBe("sk-step");
    });

    it("環境変数参照 ${VAR} を展開する", () => {
      const config = GroaConfigSchema.parse({
        apiKeys: { anthropic: "${MY_API_KEY}" },
      });
      const resolved = resolveStepConfig(config, "classify", {
        MY_API_KEY: "sk-from-env",
      });
      expect(resolved.apiKey).toBe("sk-from-env");
    });

    it("APIキーがどこにも設定されていない場合 null を返す", () => {
      const config = createDefaultConfig();
      const resolved = resolveStepConfig(config, "classify", {});
      expect(resolved.apiKey).toBeNull();
    });
  });

  describe("モデル解決", () => {
    it("classify には haiku ティアが適用される", () => {
      const config = createDefaultConfig();
      const resolved = resolveStepConfig(config, "classify", {});
      expect(resolved.model).toBe("claude-haiku-4-5-20251001");
    });

    it("analyze には sonnet ティアが適用される", () => {
      const config = createDefaultConfig();
      const resolved = resolveStepConfig(config, "analyze", {});
      expect(resolved.model).toBe("claude-sonnet-4-6-20250227");
    });

    it("synthesize には opus ティアが適用される", () => {
      const config = createDefaultConfig();
      const resolved = resolveStepConfig(config, "synthesize", {});
      expect(resolved.model).toBe("claude-opus-4-6-20250313");
    });

    it("工程別モデル指定が最優先される", () => {
      const config = GroaConfigSchema.parse({
        steps: { classify: { model: "custom-model" } },
      });
      const resolved = resolveStepConfig(config, "classify", {});
      expect(resolved.model).toBe("custom-model");
    });

    it("ティアなし工程は sonnet にフォールバックする", () => {
      const config = createDefaultConfig();
      const resolved = resolveStepConfig(config, "preprocess", {});
      expect(resolved.model).toBe("claude-sonnet-4-6-20250227");
    });
  });

  describe("claude-code バックエンド", () => {
    it("apiKey は常に null になる", () => {
      const config = GroaConfigSchema.parse({ backend: "claude-code" });
      const resolved = resolveStepConfig(config, "classify", {
        ANTHROPIC_API_KEY: "sk-env",
      });
      expect(resolved.backend).toBe("claude-code");
      expect(resolved.apiKey).toBeNull();
    });

    it("モデル解決は api バックエンドと同じ優先順位", () => {
      const config = GroaConfigSchema.parse({
        backend: "claude-code",
        steps: { classify: { model: "custom-model" } },
      });
      const resolved = resolveStepConfig(config, "classify", {});
      expect(resolved.model).toBe("custom-model");
    });
  });

  describe("params 抽出", () => {
    it("model/apiKey を除いたパラメータが params に入る", () => {
      const config = GroaConfigSchema.parse({
        steps: { classify: { batchSize: 100 } },
      });
      const resolved = resolveStepConfig(config, "classify", {});
      expect(resolved.params).toEqual(
        expect.objectContaining({ batchSize: 100 }),
      );
      expect(resolved.params).not.toHaveProperty("model");
      expect(resolved.params).not.toHaveProperty("apiKey");
    });
  });
});

describe("checkConfigPermissions", () => {
  it("APIキーが直接記述されパーミッションが0600以外の場合に警告を返す", () => {
    const config = GroaConfigSchema.parse({
      apiKeys: { anthropic: "sk-direct-key" },
    });
    const warnings = checkConfigPermissions(config, "groa.json", () => ({
      mode: 0o100644,
    }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("600");
  });

  it("パーミッションが0600の場合は警告なし", () => {
    const config = GroaConfigSchema.parse({
      apiKeys: { anthropic: "sk-direct-key" },
    });
    const warnings = checkConfigPermissions(config, "groa.json", () => ({
      mode: 0o100600,
    }));
    expect(warnings).toHaveLength(0);
  });

  it("環境変数参照の場合は警告なし", () => {
    const config = GroaConfigSchema.parse({
      apiKeys: { anthropic: "${ANTHROPIC_API_KEY}" },
    });
    const warnings = checkConfigPermissions(config, "groa.json", () => ({
      mode: 0o100644,
    }));
    expect(warnings).toHaveLength(0);
  });

  it("APIキーが未設定の場合は警告なし", () => {
    const config = createDefaultConfig();
    const warnings = checkConfigPermissions(config, "groa.json", () => ({
      mode: 0o100644,
    }));
    expect(warnings).toHaveLength(0);
  });
});
