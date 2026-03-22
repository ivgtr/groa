import type { TweetCorpus, Tweet, TaggedTweet } from "@groa/types";
import type {
  LlmBackend,
  LlmRequest,
  BatchRequest,
  BatchOptions,
} from "@groa/llm-client";
import type { BatchClient } from "@groa/llm-client";
import { buildClassifyPrompt } from "./prompt.js";
import { parseClassifyResponse } from "./parse.js";

const DEFAULT_BATCH_SIZE = 50;
const MAX_TOKENS = 4096;
const FAILURE_RATE_THRESHOLD = 0.1;

export interface ClassifyOptions {
  batchSize?: number;
  batchApiOptions?: BatchOptions;
  onProgress?: (processed: number, total: number) => void;
}

/**
 * ツイートにカテゴリ・感情ラベル・トピックを付与する。
 *
 * @param corpus 前処理済みのツイートコーパス
 * @param backend LLMバックエンド
 * @param batchClient Batch APIクライアント（apiバックエンド時に指定、claude-code時はnull）
 * @param options オプション
 */
export async function classify(
  corpus: TweetCorpus,
  backend: LlmBackend,
  batchClient: BatchClient | null,
  options: ClassifyOptions = {},
): Promise<TaggedTweet[]> {
  if (corpus.tweets.length === 0) return [];

  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const batches = splitIntoBatches(corpus.tweets, batchSize);
  const totalTweets = corpus.tweets.length;

  const executeFn = async (): Promise<{
    tagged: TaggedTweet[];
    fallbackCount: number;
  }> => {
    if (batchClient) {
      return classifyWithBatchApi(batches, batchClient, options);
    }
    return classifySequentially(batches, backend, totalTweets, options);
  };

  return executeWithRetry(executeFn, totalTweets);
}

/** ツイートをバッチに分割する */
export function splitIntoBatches(
  tweets: Tweet[],
  batchSize: number,
): Tweet[][] {
  const batches: Tweet[][] = [];
  for (let i = 0; i < tweets.length; i += batchSize) {
    batches.push(tweets.slice(i, i + batchSize));
  }
  return batches;
}

/** 分類用LlmRequestを構築する */
export function buildLlmRequest(tweets: Tweet[]): LlmRequest {
  const { system, user } = buildClassifyPrompt(tweets);
  return {
    model: "haiku",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: MAX_TOKENS,
    options: {
      temperature: 0.0,
      useCache: false,
      useBatch: true,
    },
  };
}

/** Batch APIによる分類 */
async function classifyWithBatchApi(
  batches: Tweet[][],
  batchClient: BatchClient,
  options: ClassifyOptions,
): Promise<{ tagged: TaggedTweet[]; fallbackCount: number }> {
  const batchRequests: BatchRequest[] = batches.map((batch, i) => ({
    customId: `classify-batch-${i}`,
    request: buildLlmRequest(batch),
  }));

  const results = await batchClient.submitWithRetry(
    batchRequests,
    options.batchApiOptions,
  );

  let allTagged: TaggedTweet[] = [];
  let totalFallback = 0;

  for (let i = 0; i < batches.length; i++) {
    const result = results.find((r) => r.customId === `classify-batch-${i}`);
    if (result?.response) {
      const { tagged, fallbackCount } = parseClassifyResponse(
        result.response.content,
        batches[i],
      );
      allTagged = allTagged.concat(tagged);
      totalFallback += fallbackCount;
    } else {
      allTagged = allTagged.concat(
        batches[i].map((tweet) => ({
          tweet,
          category: "other" as const,
          sentiment: "neutral" as const,
          topics: [] as string[],
        })),
      );
      totalFallback += batches[i].length;
    }
  }

  const totalTweets = batches.reduce((sum, b) => sum + b.length, 0);
  options.onProgress?.(totalTweets, totalTweets);

  return { tagged: allTagged, fallbackCount: totalFallback };
}

/** 逐次実行による分類 */
async function classifySequentially(
  batches: Tweet[][],
  backend: LlmBackend,
  totalTweets: number,
  options: ClassifyOptions,
): Promise<{ tagged: TaggedTweet[]; fallbackCount: number }> {
  let allTagged: TaggedTweet[] = [];
  let totalFallback = 0;
  let processed = 0;

  for (const batch of batches) {
    const request = buildLlmRequest(batch);
    const response = await backend.complete(request);
    const { tagged, fallbackCount } = parseClassifyResponse(
      response.content,
      batch,
    );
    allTagged = allTagged.concat(tagged);
    totalFallback += fallbackCount;
    processed += batch.length;
    options.onProgress?.(processed, totalTweets);
  }

  return { tagged: allTagged, fallbackCount: totalFallback };
}

/** 失敗率チェック付き実行（10%超で1回リトライ） */
async function executeWithRetry(
  executeFn: () => Promise<{ tagged: TaggedTweet[]; fallbackCount: number }>,
  totalTweets: number,
): Promise<TaggedTweet[]> {
  const first = await executeFn();

  if (first.fallbackCount <= totalTweets * FAILURE_RATE_THRESHOLD) {
    return first.tagged;
  }

  console.warn(
    `分類フォールバック率が10%を超えました (${first.fallbackCount}/${totalTweets})。リトライします。`,
  );

  const retry = await executeFn();

  if (retry.fallbackCount > totalTweets * FAILURE_RATE_THRESHOLD) {
    console.warn(
      `リトライ後もフォールバック率が10%を超えています (${retry.fallbackCount}/${totalTweets})。`,
    );
  }

  return retry.tagged;
}
