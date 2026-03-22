/**
 * APIキーパターン:
 * - sk-ant-* (Anthropic形式)
 * - sk-* (一般的なAPI Key形式、20文字以上)
 */
const API_KEY_PATTERNS = [
  /sk-ant-[a-zA-Z0-9_-]+/g,
  /sk-[a-zA-Z0-9]{20,}/g,
];

/**
 * HTTPヘッダ内の機密値パターン:
 * - x-api-key: <value>
 * - Authorization: Bearer <value>
 * - authorization: <value>
 */
const HEADER_PATTERNS = [
  /(x-api-key:\s*)\S+/gi,
  /(authorization:\s*(?:bearer\s*)?)\S+/gi,
];

/**
 * 文字列中の機密情報をマスクする。
 * APIキーパターンとHTTP認証ヘッダの値を置換する。
 */
export function maskSensitiveValues(text: string): string {
  let result = text;

  for (const pattern of API_KEY_PATTERNS) {
    result = result.replace(pattern, (match) =>
      match.length <= 6 ? "***" : match.slice(0, 6) + "***",
    );
  }

  for (const pattern of HEADER_PATTERNS) {
    result = result.replace(pattern, "$1***");
  }

  return result;
}
