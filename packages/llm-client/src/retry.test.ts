import { describe, it, expect } from "vitest";
import {
  withRetry,
  withJsonParseRetry,
  RateLimitError,
  MaxRetriesExceededError,
  JsonParseError,
} from "./retry.js";

describe("withRetry", () => {
  it("成功時はそのまま結果を返す", async () => {
    const result = await withRetry(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("一時的なエラー後に成功する", async () => {
    let attempt = 0;
    const result = await withRetry(
      () => {
        attempt++;
        if (attempt < 2) throw new Error("temporary");
        return Promise.resolve("recovered");
      },
      { initialDelayMs: 1, multiplier: 1 },
    );
    expect(result).toBe("recovered");
    expect(attempt).toBe(2);
  });

  it("最大リトライ回数超過で MaxRetriesExceededError を throw する", async () => {
    await expect(
      withRetry(() => Promise.reject(new Error("always fails")), {
        maxRetries: 2,
        initialDelayMs: 1,
        multiplier: 1,
      }),
    ).rejects.toThrow(MaxRetriesExceededError);
  });

  it("MaxRetriesExceededError に試行回数と最後のエラーが含まれる", async () => {
    try {
      await withRetry(() => Promise.reject(new Error("test error")), {
        maxRetries: 1,
        initialDelayMs: 1,
        multiplier: 1,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MaxRetriesExceededError);
      if (error instanceof MaxRetriesExceededError) {
        expect(error.attempts).toBe(2);
        expect(error.lastError.message).toBe("test error");
      }
    }
  });

  it("RateLimitError 時に retryAfterMs に従って待機する", async () => {
    let attempt = 0;
    const startTime = Date.now();
    await withRetry(
      () => {
        attempt++;
        if (attempt < 2)
          throw new RateLimitError("rate limited", 10);
        return Promise.resolve("ok");
      },
      { maxRetries: 3, initialDelayMs: 1000, multiplier: 2 },
    );
    const elapsed = Date.now() - startTime;
    // retryAfterMs=10 なので 10ms 前後で完了するはず（1000ms のデフォルトではなく）
    expect(elapsed).toBeLessThan(500);
    expect(attempt).toBe(2);
  });

  it("RateLimitError で retryAfterMs が null の場合デフォルト遅延を使用", async () => {
    let attempt = 0;
    await withRetry(
      () => {
        attempt++;
        if (attempt < 2) throw new RateLimitError("rate limited", null);
        return Promise.resolve("ok");
      },
      { maxRetries: 3, initialDelayMs: 1, multiplier: 1 },
    );
    expect(attempt).toBe(2);
  });
});

describe("withJsonParseRetry", () => {
  it("正常なJSONを1回目でパースする", async () => {
    const result = await withJsonParseRetry(
      () => Promise.resolve('{"key": "value"}'),
      (content) => JSON.parse(content) as { key: string },
    );
    expect(result).toEqual({ key: "value" });
  });

  it("JSONパース失敗時にリトライする", async () => {
    let fetchCount = 0;
    const result = await withJsonParseRetry(
      () => {
        fetchCount++;
        if (fetchCount < 2) return Promise.resolve("invalid json");
        return Promise.resolve('{"key": "retry-ok"}');
      },
      (content) => JSON.parse(content) as { key: string },
    );
    expect(result).toEqual({ key: "retry-ok" });
    expect(fetchCount).toBe(2);
  });

  it("最大リトライ超過で JsonParseError を throw する", async () => {
    await expect(
      withJsonParseRetry(
        () => Promise.resolve("not json"),
        (content) => JSON.parse(content) as unknown,
        2,
      ),
    ).rejects.toThrow(JsonParseError);
  });

  it("JsonParseError に最後のコンテンツが含まれる", async () => {
    try {
      await withJsonParseRetry(
        () => Promise.resolve("bad content"),
        (content) => JSON.parse(content) as unknown,
        0,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(JsonParseError);
      if (error instanceof JsonParseError) {
        expect(error.rawContent).toBe("bad content");
      }
    }
  });
});
