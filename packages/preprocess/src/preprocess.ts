import type { Tweet, TweetCorpus } from "@groa/types";
import { Timestamp as toTimestamp } from "@groa/types";
import type { TweetFilter } from "./filters.js";
import type { TextNormalizer } from "./normalizers.js";
import { normalizeTweet, DEFAULT_NORMALIZERS } from "./normalizers.js";
import { createDefaultFilters } from "./filters.js";
import { ValidationError } from "./errors.js";

const MAX_INPUT_COUNT = 50_000;
const MIN_CORPUS_SIZE = 10;
const WARN_CORPUS_SIZE = 100;

export interface PreprocessOptions {
  minTweetLength?: number;
  boilerplatePatterns?: string[];
}

/**
 * 生ツイートデータを正規化・フィルタリングしてTweetCorpusを生成する。
 *
 * 処理順序:
 * 1. 入力バリデーション
 * 2. テキスト正規化
 * 3. フィルタ適用
 * 4. 出力バリデーション
 * 5. CorpusMetadata構築
 */
export function preprocess(
  tweets: Tweet[],
  options?: PreprocessOptions,
): TweetCorpus;

/**
 * カスタムフィルタ・ノーマライザを指定してTweetCorpusを生成する。
 */
export function preprocess(
  tweets: Tweet[],
  filters: TweetFilter[],
  normalizers: TextNormalizer[],
): TweetCorpus;

export function preprocess(
  tweets: Tweet[],
  filtersOrOptions?: TweetFilter[] | PreprocessOptions,
  normalizers?: TextNormalizer[],
): TweetCorpus {
  let filters: TweetFilter[];
  let norms: TextNormalizer[];

  if (Array.isArray(filtersOrOptions)) {
    filters = filtersOrOptions;
    norms = normalizers ?? DEFAULT_NORMALIZERS;
  } else {
    filters = createDefaultFilters(filtersOrOptions);
    norms = DEFAULT_NORMALIZERS;
  }

  // 入力バリデーション
  validateInput(tweets);

  const totalCount = tweets.length;

  // テキスト正規化
  const normalized = tweets.map((t) => normalizeTweet(t, norms));

  // フィルタ適用（いずれかのフィルタがtrueを返したら除外）
  const filtered = normalized.filter((t) => !filters.some((f) => f(t)));

  const filteredCount = totalCount - filtered.length;

  // 出力バリデーション
  validateOutput(filtered.length, filteredCount);

  // CorpusMetadata構築
  const timestamps = filtered.map((t) => t.timestamp as number);
  const metadata = {
    totalCount,
    dateRange: {
      start: toTimestamp(Math.min(...timestamps)),
      end: toTimestamp(Math.max(...timestamps)),
    },
    filteredCount,
  };

  return { tweets: filtered, metadata };
}

function validateInput(tweets: Tweet[]): void {
  if (tweets.length === 0) {
    throw new ValidationError(
      "入力ツイートが0件です。ツイートデータを確認してください。",
    );
  }

  if (tweets.length > MAX_INPUT_COUNT) {
    throw new ValidationError(
      `入力ツイートが上限 ${MAX_INPUT_COUNT.toLocaleString()} 件を超えています（${tweets.length.toLocaleString()} 件）。` +
        `データを分割するか、件数を減らしてください。`,
    );
  }
}

function validateOutput(
  remainingCount: number,
  filteredCount: number,
): void {
  if (remainingCount === 0) {
    console.warn(
      `前処理後のツイートが0件です（${filteredCount} 件が除外されました）。` +
        `フィルタ条件の緩和を検討してください: ` +
        `minTweetLength を小さくする、boilerplatePatterns を見直す等。`,
    );
    throw new Error(
      "前処理後のツイートが0件のため、処理を続行できません。" +
        "フィルタ条件を緩和してください。",
    );
  }

  if (remainingCount < MIN_CORPUS_SIZE) {
    throw new Error(
      `前処理後のツイートが ${remainingCount} 件です（最低 ${MIN_CORPUS_SIZE} 件必要）。` +
        `フィルタ条件の緩和またはデータの追加を検討してください。`,
    );
  }

  if (remainingCount < WARN_CORPUS_SIZE) {
    console.warn(
      `前処理後のツイートが ${remainingCount} 件です。` +
        `100件以上を推奨します。精度が低下する可能性があります。`,
    );
  }
}
