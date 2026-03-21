import { describe, it, expect } from "vitest";
import { GroaConfigSchema, createDefaultConfig } from "./schema.js";

describe("GroaConfigSchema", () => {
  it("空オブジェクトからデフォルト値で設定を生成できる", () => {
    const config = GroaConfigSchema.parse({});
    expect(config.backend).toBe("api");
    expect(config.cacheDir).toBe(".groa");
    expect(config.costLimitUsd).toBe(10.0);
  });

  it("デフォルトのモデルIDが設定される", () => {
    const config = createDefaultConfig();
    expect(config.models.haiku).toBe("claude-haiku-4-5-20251001");
    expect(config.models.sonnet).toBe("claude-sonnet-4-6-20250227");
    expect(config.models.opus).toBe("claude-opus-4-6-20250313");
    expect(config.models.embedding).toBe("multilingual-e5-small");
  });

  it("各ステップのデフォルトパラメータが正しい", () => {
    const config = createDefaultConfig();
    expect(config.steps.preprocess.minTweetLength).toBe(5);
    expect(config.steps.classify.batchSize).toBe(50);
    expect(config.steps.analyze.minClusterSize).toBe(50);
    expect(config.steps.analyze.maxClusterSize).toBe(3000);
    expect(config.steps.retrieve.topK).toBe(5);
    expect(config.steps.retrieve.sentimentDiversity).toBe(true);
    expect(config.steps.retrieve.categoryDiversity).toBe(true);
    expect(config.steps.generate.defaultTemperature).toBe(0.7);
    expect(config.steps.generate.maxLength).toBe(280);
    expect(config.steps.generate.numVariants).toBe(1);
    expect(config.steps.evaluate.threshold).toBe(6.0);
  });

  it("工程別オーバーライドのデフォルトは null", () => {
    const config = createDefaultConfig();
    expect(config.steps.classify.model).toBeNull();
    expect(config.steps.classify.apiKey).toBeNull();
    expect(config.steps.generate.model).toBeNull();
    expect(config.steps.generate.apiKey).toBeNull();
  });

  it("claudeCode のデフォルト値が正しい", () => {
    const config = createDefaultConfig();
    expect(config.claudeCode.path).toBe("claude");
    expect(config.claudeCode.maxTurns).toBe(1);
    expect(config.claudeCode.maxBudgetUsd).toBeNull();
  });

  it("backend に不正な値を拒否する", () => {
    const result = GroaConfigSchema.safeParse({ backend: "invalid" });
    expect(result.success).toBe(false);
  });

  it("部分的な設定値のみの指定が可能", () => {
    const config = GroaConfigSchema.parse({
      backend: "claude-code",
      costLimitUsd: 5.0,
      steps: {
        classify: { batchSize: 100 },
      },
    });
    expect(config.backend).toBe("claude-code");
    expect(config.costLimitUsd).toBe(5.0);
    expect(config.steps.classify.batchSize).toBe(100);
    // 未指定の値はデフォルト
    expect(config.cacheDir).toBe(".groa");
    expect(config.steps.generate.maxLength).toBe(280);
  });

  it("工程別のモデル・APIキーオーバーライドができる", () => {
    const config = GroaConfigSchema.parse({
      steps: {
        classify: { model: "custom-model", apiKey: "sk-custom" },
      },
    });
    expect(config.steps.classify.model).toBe("custom-model");
    expect(config.steps.classify.apiKey).toBe("sk-custom");
  });

  it("不正なフィールドに対してエラーを返す", () => {
    const result = GroaConfigSchema.safeParse({
      steps: {
        preprocess: { minTweetLength: "not-a-number" },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});
