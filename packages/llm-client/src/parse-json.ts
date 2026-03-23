import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// 公開型
// ---------------------------------------------------------------------------

export interface ParseLlmOptions {
  /** JSON抽出時に配列を優先する（classify 用） */
  expect?: "array";
}

// ---------------------------------------------------------------------------
// 内部: JSON テキスト抽出
// ---------------------------------------------------------------------------

/**
 * LLM レスポンスから JSON テキストを抽出する。
 * 1. コードブロック (```json ... ```) を優先
 * 2. expect === "array" なら配列 → オブジェクトの順、それ以外はオブジェクト → 配列の順
 * 3. どちらも該当しなければ全文を返す
 */
export function extractLlmJson(
  content: string,
  expect?: "array",
): string {
  // コードブロック優先
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  const objectMatch = content.match(/\{[\s\S]*\}/);
  const arrayMatch = content.match(/\[[\s\S]*\]/);

  if (expect === "array") {
    if (arrayMatch) return arrayMatch[0];
    if (objectMatch) return objectMatch[0];
  } else {
    if (objectMatch) return objectMatch[0];
    if (arrayMatch) return arrayMatch[0];
  }

  return content.trim();
}

// ---------------------------------------------------------------------------
// 内部: JSON 修復
// ---------------------------------------------------------------------------

/**
 * JSON 文字列値内の制御文字をエスケープして修復する。
 * 状態機械で「JSON文字列値の内側かどうか」を追跡し、
 * 文字列内部の制御文字（U+0000〜U+001F）のみをエスケープする。
 */
export function repairLlmJson(content: string): string {
  let inString = false;
  let escaped = false;
  let result = "";

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const code = content.charCodeAt(i);

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && inString) {
      result += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (inString && code < 0x20) {
      switch (char) {
        case "\n":
          result += "\\n";
          break;
        case "\r":
          result += "\\r";
          break;
        case "\t":
          result += "\\t";
          break;
        default:
          result += `\\u${code.toString(16).padStart(4, "0")}`;
          break;
      }
      continue;
    }

    result += char;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 公開API
// ---------------------------------------------------------------------------

/**
 * LLM レスポンスを抽出・修復・パースする。
 * スキーマ指定時は Zod バリデーション付き。
 *
 * パイプライン: extractLlmJson → JSON.parse (→ 失敗時 repairLlmJson → retry) → schema?.parse
 *
 * 失敗時: JSON.parse 失敗は SyntaxError、Zod バリデーション失敗は ZodError を throw。
 */
export function parseLlmResponse(
  content: string,
  options?: ParseLlmOptions,
): unknown;
export function parseLlmResponse<T>(
  content: string,
  schema: z.ZodType<T>,
  options?: ParseLlmOptions,
): T;
export function parseLlmResponse<T = unknown>(
  content: string,
  schemaOrOptions?: z.ZodType<T> | ParseLlmOptions,
  maybeOptions?: ParseLlmOptions,
): T | unknown {
  // 引数の解決（instanceof を先にチェックし、ZodType との誤判定を防ぐ）
  let schema: z.ZodType<T> | undefined;
  let options: ParseLlmOptions | undefined;

  if (schemaOrOptions instanceof z.ZodType) {
    schema = schemaOrOptions;
    options = maybeOptions;
  } else if (schemaOrOptions != null && typeof schemaOrOptions === "object") {
    options = schemaOrOptions as ParseLlmOptions;
  }

  const jsonText = extractLlmJson(content, options?.expect);

  // 1. まず JSON.parse を試行
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    // 2. 失敗時は修復して再試行
    const repaired = repairLlmJson(jsonText);
    raw = JSON.parse(repaired);
  }

  // 3. スキーマバリデーション（指定時のみ）
  if (schema) {
    return schema.parse(raw);
  }

  return raw;
}
