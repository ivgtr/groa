import { describe, it, expect } from "vitest";
import { maskSensitiveValues } from "./log-mask.js";

describe("maskSensitiveValues", () => {
  it("Anthropic APIキー (sk-ant-*) をマスクする", () => {
    const input = "APIキー: sk-ant-api03-abcdef1234567890abcdef";
    const result = maskSensitiveValues(input);

    expect(result).toContain("sk-ant***");
    expect(result).not.toContain("abcdef1234567890");
  });

  it("一般的なAPIキー (sk-*) をマスクする", () => {
    const input = "key=sk-abcdefghij1234567890abcdef";
    const result = maskSensitiveValues(input);

    expect(result).toContain("sk-abc***");
    expect(result).not.toContain("1234567890");
  });

  it("x-api-key ヘッダの値をマスクする", () => {
    const input = 'x-api-key: sk-ant-api03-secret123';
    const result = maskSensitiveValues(input);

    expect(result).toContain("x-api-key:");
    expect(result).toContain("***");
    expect(result).not.toContain("secret123");
  });

  it("Authorization ヘッダの値をマスクする", () => {
    const input = "Authorization: Bearer my-secret-token-12345678901234567890";
    const result = maskSensitiveValues(input);

    expect(result).toContain("Authorization:");
    expect(result).toContain("***");
    expect(result).not.toContain("my-secret-token");
  });

  it("機密情報を含まないテキストは変更しない", () => {
    const input = "Step 2: Classifying... 157/157 batches [$0.17]";
    expect(maskSensitiveValues(input)).toBe(input);
  });

  it("複数のAPIキーを含むテキストをすべてマスクする", () => {
    const input = "key1=sk-ant-api03-abc123 key2=sk-ant-api03-def456";
    const result = maskSensitiveValues(input);

    expect(result).not.toContain("abc123");
    expect(result).not.toContain("def456");
  });

  it("空文字列は空文字列を返す", () => {
    expect(maskSensitiveValues("")).toBe("");
  });
});
