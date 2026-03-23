import { describe, it, expect } from "vitest";
import { z } from "zod/v4";
import { extractLlmJson, repairLlmJson, parseLlmResponse } from "./parse-json.js";

// ---------------------------------------------------------------------------
// extractLlmJson
// ---------------------------------------------------------------------------

describe("extractLlmJson", () => {
  it("コードブロック ```json ... ``` から抽出する", () => {
    const content = '```json\n{"key": "value"}\n```';
    expect(extractLlmJson(content)).toBe('{"key": "value"}');
  });

  it("コードブロック ``` ... ``` (jsonタグなし) から抽出する", () => {
    const content = '```\n{"key": "value"}\n```';
    expect(extractLlmJson(content)).toBe('{"key": "value"}');
  });

  it("裸の JSON オブジェクトを抽出する", () => {
    const content = 'Here is the result: {"key": "value"} done.';
    expect(extractLlmJson(content)).toBe('{"key": "value"}');
  });

  it("裸の JSON 配列を expect: 'array' で抽出する", () => {
    const content = 'Results: [{"id": 1}, {"id": 2}] end.';
    expect(extractLlmJson(content, "array")).toBe('[{"id": 1}, {"id": 2}]');
  });

  it("expect: 'array' で配列が優先される", () => {
    const content = '{"error": "none"}\n[{"id": 1}]';
    expect(extractLlmJson(content, "array")).toBe('[{"id": 1}]');
  });

  it("expect 省略でオブジェクトが優先される（貪欲マッチ）", () => {
    // /\{[\s\S]*\}/ は最初の { から最後の } まで貪欲マッチ
    const content = '{"key": "value"}\nextra';
    expect(extractLlmJson(content)).toBe('{"key": "value"}');
  });

  it("前後にテキストがある場合でも抽出する", () => {
    const content = "以下が分析結果です。\n\n" + '{"portrait": "テスト"}' + "\n\n以上です。";
    const result = extractLlmJson(content);
    expect(result).toContain('"portrait"');
  });

  it("JSON が見つからない場合は全文を返す", () => {
    const content = "これはJSONではありません";
    expect(extractLlmJson(content)).toBe("これはJSONではありません");
  });

  it("コードブロックが最優先（配列JSONのコードブロック）", () => {
    const content = '```json\n[{"id": 1}]\n```\n{"extra": true}';
    expect(extractLlmJson(content)).toBe('[{"id": 1}]');
  });
});

// ---------------------------------------------------------------------------
// repairLlmJson
// ---------------------------------------------------------------------------

describe("repairLlmJson", () => {
  it("文字列値内の生の改行を \\n に変換する", () => {
    const input = '{"text": "line1\nline2"}';
    const result = repairLlmJson(input);
    expect(result).toBe('{"text": "line1\\nline2"}');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("文字列値内の \\r を \\r に変換する", () => {
    const input = '{"text": "line1\rline2"}';
    const result = repairLlmJson(input);
    expect(result).toBe('{"text": "line1\\rline2"}');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("文字列値内の \\t を \\t に変換する", () => {
    const input = '{"text": "col1\tcol2"}';
    const result = repairLlmJson(input);
    expect(result).toBe('{"text": "col1\\tcol2"}');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("文字列の外側の改行はそのまま保持する", () => {
    const input = '{\n  "key": "value"\n}';
    const result = repairLlmJson(input);
    expect(result).toBe(input);
  });

  it("既にエスケープ済み（\\n）は変更しない", () => {
    const input = '{"text": "line1\\nline2"}';
    const result = repairLlmJson(input);
    expect(result).toBe(input);
  });

  it('エスケープされた引用符（\\"）で inString が壊れない', () => {
    const input = '{"text": "He said \\"hello\\""}';
    const result = repairLlmJson(input);
    expect(result).toBe(input);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('\\\\"（エスケープされたバックスラッシュ+引用符）が正しく処理される', () => {
    // JSON: {"text": "path\\"} → value は path\
    const input = '{"text": "path\\\\"}';
    const result = repairLlmJson(input);
    expect(result).toBe(input);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("文字列値を含まないJSON は変更されない", () => {
    const input = '{"count": 42, "active": true}';
    const result = repairLlmJson(input);
    expect(result).toBe(input);
  });

  it("複数の文字列フィールドに制御文字がある場合", () => {
    const input = '{"a": "x\ny", "b": "p\tq"}';
    const result = repairLlmJson(input);
    expect(result).toBe('{"a": "x\\ny", "b": "p\\tq"}');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("portrait のような長文テキスト内の改行を修復する", () => {
    const portrait = "この人物は技術的な話題において、\n断定的な語り口を好む。\n具体的には「〜だ」という語尾を多用する。";
    const input = `{"portrait": "${portrait}"}`;
    const result = repairLlmJson(input);
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result) as { portrait: string };
    expect(parsed.portrait).toContain("断定的な語り口を好む。");
  });
});

// ---------------------------------------------------------------------------
// parseLlmResponse（スキーマなし）
// ---------------------------------------------------------------------------

describe("parseLlmResponse（スキーマなし）", () => {
  it("正常なJSONをパースする", () => {
    const content = '{"key": "value"}';
    expect(parseLlmResponse(content)).toEqual({ key: "value" });
  });

  it("コードブロック内JSONをパースする", () => {
    const content = '```json\n{"key": "value"}\n```';
    expect(parseLlmResponse(content)).toEqual({ key: "value" });
  });

  it("制御文字入りJSONを修復してパースする", () => {
    const content = '{"text": "line1\nline2"}';
    const result = parseLlmResponse(content) as { text: string };
    expect(result.text).toBe("line1\nline2");
  });

  it("完全に不正なテキストで例外を throw する", () => {
    expect(() => parseLlmResponse("not json at all")).toThrow();
  });

  it("expect: 'array' で配列JSONを正しくパースする", () => {
    const content = '[{"id": 1}, {"id": 2}]';
    const result = parseLlmResponse(content, { expect: "array" });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseLlmResponse（スキーマあり）
// ---------------------------------------------------------------------------

describe("parseLlmResponse（スキーマあり）", () => {
  const TestSchema = z.object({
    name: z.string(),
    count: z.number(),
  });

  it("正常なJSON + スキーマ一致で型付き結果を返す", () => {
    const content = '{"name": "test", "count": 42}';
    const result = parseLlmResponse(content, TestSchema);
    expect(result.name).toBe("test");
    expect(result.count).toBe(42);
  });

  it("JSON構造OK + スキーマ不一致で例外を throw する", () => {
    const content = '{"name": "test", "count": "not a number"}';
    expect(() => parseLlmResponse(content, TestSchema)).toThrow();
  });

  it("制御文字入りJSON + スキーマ一致で修復してパースする", () => {
    const content = '{"name": "hello\nworld", "count": 1}';
    const result = parseLlmResponse(content, TestSchema);
    expect(result.name).toBe("hello\nworld");
    expect(result.count).toBe(1);
  });

  it("コードブロック内JSON + スキーマあり", () => {
    const content = '```json\n{"name": "test", "count": 5}\n```';
    const result = parseLlmResponse(content, TestSchema);
    expect(result.name).toBe("test");
  });
});
