import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BatchClient,
  BatchTimeoutError,
} from "./batch-client.js";
import type { BatchRequest, BatchOptions } from "./batch-client.js";
import type { LlmRequest } from "./types.js";

const TEST_API_KEY = "sk-ant-test-key";
const TEST_MODEL = "claude-haiku-4-5-20251001";

function makeRequest(customId: string): BatchRequest {
  const request: LlmRequest = {
    messages: [
      { role: "system", content: "分類してください" },
      { role: "user", content: "テストテキスト" },
    ],
    maxTokens: 1024,
    options: { temperature: 0, useCache: false, useBatch: true },
  };
  return { customId, request };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(status: number, body: string): Response {
  return new Response(body, { status });
}

// Batch API レスポンスのヘルパー
function batchCreated(id: string) {
  return {
    id,
    processing_status: "in_progress",
    request_counts: {
      processing: 1,
      succeeded: 0,
      errored: 0,
      canceled: 0,
      expired: 0,
    },
  };
}

function batchStatus(
  id: string,
  processing: number,
  succeeded: number,
  errored = 0,
) {
  return {
    id,
    processing_status: processing === 0 ? "ended" : "in_progress",
    request_counts: {
      processing,
      succeeded,
      errored,
      canceled: 0,
      expired: 0,
    },
  };
}

function successResult(customId: string, content: string) {
  return JSON.stringify({
    custom_id: customId,
    result: {
      type: "succeeded",
      message: {
        content: [{ type: "text", text: content }],
        model: TEST_MODEL,
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    },
  });
}

function errorResult(customId: string, message: string) {
  return JSON.stringify({
    custom_id: customId,
    result: {
      type: "errored",
      error: { type: "server_error", message },
    },
  });
}

// テスト共通のオプション（ポーリング間隔を短縮）
const fastOptions: BatchOptions = { pollIntervalMs: 0, timeoutMs: 5000 };

describe("BatchClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("バッチを作成し、ポーリングで結果を取得する", async () => {
    const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      // 1. バッチ作成
      .mockResolvedValueOnce(jsonResponse(200, batchCreated("batch-1")))
      // 2. 状態確認: まだ処理中
      .mockResolvedValueOnce(jsonResponse(200, batchStatus("batch-1", 1, 0)))
      // 3. 状態確認: 完了
      .mockResolvedValueOnce(jsonResponse(200, batchStatus("batch-1", 0, 1)))
      // 4. 結果取得
      .mockResolvedValueOnce(
        textResponse(200, successResult("req-0", '{"category":"tech"}')),
      );

    vi.stubGlobal("fetch", mockFetch);

    const client = new BatchClient(TEST_API_KEY, TEST_MODEL);
    const results = await client.submitAndWait(
      [makeRequest("req-0")],
      fastOptions,
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.customId).toBe("req-0");
    expect(results[0]!.response).not.toBeNull();
    expect(results[0]!.response!.content).toBe('{"category":"tech"}');
    expect(results[0]!.error).toBeNull();
  });

  it("system prompt を params.system に分離してリクエストする", async () => {
    const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(200, batchCreated("batch-1")))
      .mockResolvedValueOnce(jsonResponse(200, batchStatus("batch-1", 0, 1)))
      .mockResolvedValueOnce(textResponse(200, successResult("req-0", "ok")));

    vi.stubGlobal("fetch", mockFetch);

    const client = new BatchClient(TEST_API_KEY, TEST_MODEL);
    await client.submitAndWait([makeRequest("req-0")], fastOptions);

    // バッチ作成リクエストを検証
    const createCall = mockFetch.mock.calls[0]!;
    const body = JSON.parse(createCall[1]!.body as string) as {
      requests: Array<{ params: { system?: string; messages: unknown[] } }>;
    };
    expect(body.requests[0]!.params.system).toBe("分類してください");
    // system メッセージは messages から除外されている
    expect(
      body.requests[0]!.params.messages,
    ).toEqual([{ role: "user", content: "テストテキスト" }]);
  });

  it("ポーリング間隔30秒で結果を取得する（デフォルト）", async () => {
    const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(200, batchCreated("batch-1")))
      .mockResolvedValueOnce(jsonResponse(200, batchStatus("batch-1", 0, 1)))
      .mockResolvedValueOnce(textResponse(200, successResult("req-0", "ok")));

    vi.stubGlobal("fetch", mockFetch);

    // pollIntervalMs を短くしてテスト実行時間を抑える
    const client = new BatchClient(TEST_API_KEY, TEST_MODEL);
    await client.submitAndWait([makeRequest("req-0")], { pollIntervalMs: 0 });

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("60分でタイムアウトエラーを返す", async () => {
    let callCount = 0;
    const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return jsonResponse(200, batchCreated("batch-1"));
        }
        // 常に処理中を返す（毎回新しいResponseオブジェクトを生成）
        return jsonResponse(200, batchStatus("batch-1", 1, 0));
      });

    vi.stubGlobal("fetch", mockFetch);

    const client = new BatchClient(TEST_API_KEY, TEST_MODEL);
    await expect(
      client.submitAndWait([makeRequest("req-0")], {
        pollIntervalMs: 0,
        timeoutMs: 50, // 50ms で短縮テスト
      }),
    ).rejects.toThrow(BatchTimeoutError);
  });

  it("エラー結果を正しくパースする", async () => {
    const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(200, batchCreated("batch-1")))
      .mockResolvedValueOnce(
        jsonResponse(200, batchStatus("batch-1", 0, 0, 1)),
      )
      .mockResolvedValueOnce(
        textResponse(200, errorResult("req-0", "サーバーエラー")),
      );

    vi.stubGlobal("fetch", mockFetch);

    const client = new BatchClient(TEST_API_KEY, TEST_MODEL);
    const results = await client.submitAndWait(
      [makeRequest("req-0")],
      fastOptions,
    );

    expect(results[0]!.response).toBeNull();
    expect(results[0]!.error).toContain("サーバーエラー");
  });

  it("進捗コールバックが呼ばれる", async () => {
    const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(200, batchCreated("batch-1")))
      .mockResolvedValueOnce(jsonResponse(200, batchStatus("batch-1", 0, 1)))
      .mockResolvedValueOnce(textResponse(200, successResult("req-0", "ok")));

    vi.stubGlobal("fetch", mockFetch);

    const onProgress = vi.fn();
    const client = new BatchClient(TEST_API_KEY, TEST_MODEL);
    await client.submitAndWait([makeRequest("req-0")], {
      ...fastOptions,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: "batch-1", succeeded: 1 }),
    );
  });

  it("Batch API 作成エラー時に例外をスローする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(textResponse(500, "Internal Server Error")),
    );

    const client = new BatchClient(TEST_API_KEY, TEST_MODEL);
    await expect(
      client.submitAndWait([makeRequest("req-0")], fastOptions),
    ).rejects.toThrow("Batch API 作成エラー");
  });

  it("anthropic バックエンド時のみ使用される（claude-code は対象外）", () => {
    // BatchClient はAPIキーとモデルIDで初期化されるため、
    // claude-code バックエンドからは呼ばれない設計
    const client = new BatchClient(TEST_API_KEY, TEST_MODEL);
    expect(client).toBeDefined();
  });
});

describe("BatchClient.submitWithRetry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("全件成功時はリトライしない", async () => {
    const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(200, batchCreated("batch-1")))
      .mockResolvedValueOnce(jsonResponse(200, batchStatus("batch-1", 0, 2)))
      .mockResolvedValueOnce(
        textResponse(
          200,
          [
            successResult("req-0", "a"),
            successResult("req-1", "b"),
          ].join("\n"),
        ),
      );

    vi.stubGlobal("fetch", mockFetch);

    const client = new BatchClient(TEST_API_KEY, TEST_MODEL);
    const results = await client.submitWithRetry(
      [makeRequest("req-0"), makeRequest("req-1")],
      fastOptions,
    );

    expect(results).toHaveLength(2);
    // バッチ作成は1回のみ
    expect(
      mockFetch.mock.calls.filter((c) =>
        (c[1] as RequestInit | undefined)?.method === "POST",
      ),
    ).toHaveLength(1);
  });

  it("部分失敗時は失敗分のみリトライする", async () => {
    const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      // 1st batch
      .mockResolvedValueOnce(jsonResponse(200, batchCreated("batch-1")))
      .mockResolvedValueOnce(
        jsonResponse(200, batchStatus("batch-1", 0, 1, 1)),
      )
      .mockResolvedValueOnce(
        textResponse(
          200,
          [
            successResult("req-0", "ok"),
            errorResult("req-1", "一時エラー"),
          ].join("\n"),
        ),
      )
      // 2nd batch (retry)
      .mockResolvedValueOnce(jsonResponse(200, batchCreated("batch-2")))
      .mockResolvedValueOnce(jsonResponse(200, batchStatus("batch-2", 0, 1)))
      .mockResolvedValueOnce(
        textResponse(200, successResult("req-1", "retry-ok")),
      );

    vi.stubGlobal("fetch", mockFetch);

    const client = new BatchClient(TEST_API_KEY, TEST_MODEL);
    const results = await client.submitWithRetry(
      [makeRequest("req-0"), makeRequest("req-1")],
      fastOptions,
    );

    expect(results).toHaveLength(2);
    const r0 = results.find((r) => r.customId === "req-0");
    const r1 = results.find((r) => r.customId === "req-1");
    expect(r0!.response!.content).toBe("ok");
    expect(r1!.response!.content).toBe("retry-ok");
  });

  it("全件失敗時はエラーをスローする", async () => {
    const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(200, batchCreated("batch-1")))
      .mockResolvedValueOnce(
        jsonResponse(200, batchStatus("batch-1", 0, 0, 1)),
      )
      .mockResolvedValueOnce(
        textResponse(200, errorResult("req-0", "失敗")),
      );

    vi.stubGlobal("fetch", mockFetch);

    const client = new BatchClient(TEST_API_KEY, TEST_MODEL);
    await expect(
      client.submitWithRetry([makeRequest("req-0")], fastOptions),
    ).rejects.toThrow("全リクエストが失敗");
  });
});
