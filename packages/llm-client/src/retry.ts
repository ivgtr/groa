/** リトライ設定 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  multiplier: number;
  retryAfterMs?: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  multiplier: 2,
};

/** レート制限エラー */
export class RateLimitError extends Error {
  retryAfterMs: number | null;
  constructor(message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** 最大リトライ超過エラー */
export class MaxRetriesExceededError extends Error {
  attempts: number;
  lastError: Error;
  constructor(message: string, attempts: number, lastError: Error) {
    super(message);
    this.name = "MaxRetriesExceededError";
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/** JSONパース失敗エラー */
export class JsonParseError extends Error {
  rawContent: string;
  constructor(message: string, rawContent: string) {
    super(message);
    this.name = "JsonParseError";
    this.rawContent = rawContent;
  }
}

/** 指定ミリ秒待機する */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 指数バックオフ付きリトライ
 *
 * レート制限(429)時は Retry-After に従い自動リトライ。
 * 最大リトライ回数超過時にエラーを throw する。
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const { maxRetries, initialDelayMs, multiplier } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: Error = new Error("No attempts made");
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= maxRetries) break;

      // nonRetryable フラグが立っているエラーは即座に再throw
      if (
        typeof error === "object" &&
        error !== null &&
        "nonRetryable" in error &&
        (error as { nonRetryable: boolean }).nonRetryable
      ) {
        throw error;
      }

      if (error instanceof RateLimitError) {
        const waitMs = error.retryAfterMs ?? delay;
        await sleep(waitMs);
        delay = waitMs * multiplier;
      } else {
        await sleep(delay);
        delay *= multiplier;
      }
    }
  }

  throw new MaxRetriesExceededError(
    `${maxRetries + 1}回の試行すべてが失敗しました。` +
      `最後のエラー: ${lastError.message}。` +
      `APIキーの有効性とレート制限を確認してください。`,
    maxRetries + 1,
    lastError,
  );
}

/**
 * LLMレスポンスからJSONをパースする（最大2回リトライ）
 */
export async function withJsonParseRetry<T>(
  fetchFn: () => Promise<string>,
  parseFn: (content: string) => T,
  maxRetries = 2,
): Promise<T> {
  let lastError: Error = new Error("No attempts made");
  let lastContent = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const content = attempt === 0 ? await fetchFn() : await fetchFn();
    lastContent = content;

    try {
      return parseFn(content);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new JsonParseError(
    `JSONパースが${maxRetries + 1}回失敗しました。` +
      `最後のエラー: ${lastError.message}。` +
      `LLMの応答形式を確認してください。`,
    lastContent,
  );
}
