/** APIキーとして検出するパターン */
const API_KEY_PATTERNS = [/sk-ant-/i, /sk-[a-zA-Z0-9]{20,}/];

/**
 * オブジェクトからAPIキー等の機密データを再帰的に除去する。
 * apiKey, api_key, apiKeys 等のフィールドを "[REDACTED]" に置換する。
 */
export function stripSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  // TypedArray（Float32Array 等）はそのまま返す
  if (ArrayBuffer.isView(data)) return data;

  if (Array.isArray(data)) {
    return data.map((item) => stripSensitiveData(item));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(
    data as Record<string, unknown>,
  )) {
    if (/api_?key/i.test(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = stripSensitiveData(value);
    }
  }
  return result;
}

/**
 * JSON文字列にAPIキーパターンが含まれていないことを検証する。
 * 含まれていた場合、エラーをスローする。
 */
export function assertNoApiKeys(json: string, context: string): void {
  for (const pattern of API_KEY_PATTERNS) {
    if (pattern.test(json)) {
      throw new Error(
        `${context}にAPIキーが含まれています。出力データからAPIキーを除去してください。`,
      );
    }
  }
}
