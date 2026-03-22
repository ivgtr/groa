import { ModelIdString } from "@groa/types";
import type { LlmRequest, LlmResponse } from "./types.js";

const BATCH_API_URL = "https://api.anthropic.com/v1/messages/batches";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000; // 60分

export interface BatchRequest {
  customId: string;
  request: LlmRequest;
}

export interface BatchResult {
  customId: string;
  response: LlmResponse | null;
  error: string | null;
}

export interface BatchOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  onProgress?: (status: BatchStatus) => void;
}

export interface BatchStatus {
  batchId: string;
  processing: number;
  succeeded: number;
  errored: number;
}

/** Batch API のタイムアウトエラー */
export class BatchTimeoutError extends Error {
  readonly code = "BATCH_TIMEOUT" as const;
  constructor(batchId: string, timeoutMs: number) {
    super(
      `Batch ${batchId} が ${Math.round(timeoutMs / 60000)} 分以内に完了しませんでした。`,
    );
  }
}

// --- Anthropic Batch API レスポンス型 ---

interface AnthropicBatchResponse {
  id: string;
  processing_status: string;
  request_counts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
}

interface AnthropicResultLine {
  custom_id: string;
  result: {
    type: "succeeded" | "errored" | "expired" | "canceled";
    message?: {
      content: Array<{ type: string; text: string }>;
      model: string;
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    };
    error?: { type: string; message: string };
  };
}

/**
 * Anthropic Batch API クライアント。
 * リクエスト群を一括投入し、ポーリングで結果を取得する。
 */
export class BatchClient {
  constructor(
    private readonly apiKey: string,
    private readonly modelId: string,
  ) {}

  /**
   * バッチを投入し、完了まで待機して結果を返す。
   * 部分失敗時は失敗分のみを1回リトライする（B-9対応）。
   */
  async submitWithRetry(
    requests: BatchRequest[],
    options: BatchOptions = {},
  ): Promise<BatchResult[]> {
    const results = await this.submitAndWait(requests, options);

    const failed = results.filter((r) => r.error !== null);
    const succeeded = results.filter((r) => r.error === null);

    if (failed.length === 0) return results;
    if (failed.length === requests.length) {
      throw new Error("バッチの全リクエストが失敗しました。");
    }

    // 失敗分のみリトライ（最大1回）
    const retryMap = new Map(requests.map((r) => [r.customId, r]));
    const retryRequests = failed
      .map((f) => retryMap.get(f.customId))
      .filter((r): r is BatchRequest => r != null);

    const retryResults = await this.submitAndWait(retryRequests, options);
    return [...succeeded, ...retryResults];
  }

  /**
   * バッチを投入し、完了まで待機して結果を返す。
   */
  async submitAndWait(
    requests: BatchRequest[],
    options: BatchOptions = {},
  ): Promise<BatchResult[]> {
    const {
      pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      onProgress,
    } = options;

    const batchId = await this.createBatch(requests);
    const startTime = Date.now();

    // ポーリング
    while (true) {
      await sleep(pollIntervalMs);

      if (Date.now() - startTime > timeoutMs) {
        throw new BatchTimeoutError(batchId, timeoutMs);
      }

      const status = await this.checkStatus(batchId);
      onProgress?.(status);

      if (status.processing === 0) {
        break;
      }
    }

    return this.fetchResults(batchId);
  }

  private async createBatch(requests: BatchRequest[]): Promise<string> {
    const body = {
      requests: requests.map((r) => this.toApiRequest(r)),
    };

    const response = await fetch(BATCH_API_URL, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Batch API 作成エラー (${response.status}): ${text}`);
    }

    const data = (await response.json()) as AnthropicBatchResponse;
    return data.id;
  }

  private async checkStatus(batchId: string): Promise<BatchStatus> {
    const response = await fetch(`${BATCH_API_URL}/${batchId}`, {
      headers: this.headers(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Batch 状態確認エラー (${response.status}): ${text}`);
    }

    const data = (await response.json()) as AnthropicBatchResponse;
    return {
      batchId: data.id,
      processing: data.request_counts.processing,
      succeeded: data.request_counts.succeeded,
      errored: data.request_counts.errored,
    };
  }

  private async fetchResults(batchId: string): Promise<BatchResult[]> {
    const response = await fetch(`${BATCH_API_URL}/${batchId}/results`, {
      headers: this.headers(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Batch 結果取得エラー (${response.status}): ${text}`);
    }

    const text = await response.text();
    const lines = text.trim().split("\n").filter(Boolean);

    return lines.map((line) => {
      const parsed = JSON.parse(line) as AnthropicResultLine;
      return this.toResult(parsed);
    });
  }

  private toApiRequest(
    req: BatchRequest,
  ): { custom_id: string; params: Record<string, unknown> } {
    const systemMsg = req.request.messages.find((m) => m.role === "system");
    const nonSystemMsgs = req.request.messages.filter(
      (m) => m.role !== "system",
    );

    const params: Record<string, unknown> = {
      model: this.modelId,
      max_tokens: req.request.maxTokens,
      messages: nonSystemMsgs.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemMsg) {
      params.system = systemMsg.content;
    }

    if (req.request.options.temperature !== undefined) {
      params.temperature = req.request.options.temperature;
    }

    return { custom_id: req.customId, params };
  }

  private toResult(line: AnthropicResultLine): BatchResult {
    if (line.result.type !== "succeeded" || !line.result.message) {
      return {
        customId: line.custom_id,
        response: null,
        error:
          line.result.error?.message ??
          `バッチリクエスト失敗: ${line.result.type}`,
      };
    }

    const msg = line.result.message;
    const textContent = msg.content.find((c) => c.type === "text");
    const cachedTokens =
      (msg.usage.cache_read_input_tokens ?? 0) +
      (msg.usage.cache_creation_input_tokens ?? 0);

    return {
      customId: line.custom_id,
      response: {
        content: textContent?.text ?? "",
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        modelUsed: ModelIdString(msg.model),
        cachedTokens,
        costUsd: null,
      },
      error: null,
    };
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
