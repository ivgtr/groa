import type { ModelIdString } from "@groa/types";

/** モデルダウンロード進捗情報 */
export interface ModelProgress {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

/** 進捗コールバック型 */
export type ProgressCallback = (progress: ModelProgress) => void;

/** Embedder インターフェース（設計仕様 §3.5） */
export interface Embedder {
  /** ドキュメント（パッセージ）のEmbeddingをバッチ生成する。"passage: " プレフィックス付与。 */
  embed(texts: string[]): Promise<Float32Array[]>;
  /** 検索クエリのEmbeddingを生成する。"query: " プレフィックス付与（multilingual-e5仕様）。 */
  embedQuery(text: string): Promise<Float32Array>;
}

/** Embedder 作成オプション */
export interface EmbedderOptions {
  model?: ModelIdString;
  batchSize?: number;
  onProgress?: ProgressCallback;
}

// Transformers.js の feature-extraction 出力型
interface ExtractorOutput {
  tolist(): number[][];
}

type ExtractorPipeline = (
  texts: string[],
  options?: { pooling?: string; normalize?: boolean },
) => Promise<ExtractorOutput>;

export const DEFAULT_MODEL = "Xenova/multilingual-e5-small" as ModelIdString;
const DEFAULT_BATCH_SIZE = 128;

/**
 * Transformers.js ベースの Embedder を作成する。
 * 初回呼び出し時にモデルをダウンロードし、以降はキャッシュから読み込む。
 */
export async function createEmbedder(
  options: EmbedderOptions = {},
): Promise<Embedder> {
  const {
    model = DEFAULT_MODEL,
    batchSize = DEFAULT_BATCH_SIZE,
    onProgress,
  } = options;

  // @xenova/transformers を動的インポート（Node.js / ブラウザ両対応）
  const { pipeline } = (await import("@xenova/transformers")) as unknown as {
    pipeline(
      task: string,
      model: string,
      options?: Record<string, unknown>,
    ): Promise<ExtractorPipeline>;
  };

  const extractor = await pipeline("feature-extraction", model, {
    quantized: true,
    ...(onProgress != null ? { progress_callback: onProgress } : {}),
  });

  return {
    async embed(texts: string[]): Promise<Float32Array[]> {
      const results: Float32Array[] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        // multilingual-e5 の仕様: "passage: " プレフィックスを付与
        const prefixed = batch.map((t) => `passage: ${t}`);

        const output = await extractor(prefixed, {
          pooling: "mean",
          normalize: true,
        });

        const vectors = output.tolist();
        for (const vec of vectors) {
          results.push(new Float32Array(vec));
        }
      }

      return results;
    },

    async embedQuery(text: string): Promise<Float32Array> {
      // multilingual-e5 の仕様: 検索クエリには "query: " プレフィックスを付与
      const output = await extractor([`query: ${text}`], {
        pooling: "mean",
        normalize: true,
      });
      const vectors = output.tolist();
      return new Float32Array(vectors[0]!);
    },
  };
}
