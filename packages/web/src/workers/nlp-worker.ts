/**
 * NLP Web Worker
 *
 * kuromoji.js（形態素解析）と Transformers.js（Embedding 生成）を
 * メインスレッドから切り離して実行する。
 */

import type { WorkerRequest, WorkerResponse, KuromojiTokenData } from "./types";

// ---------- 状態 ----------

let tokenizer: KuromojiTokenizer | null = null;
let extractor: ExtractorPipeline | null = null;

// ---------- 型（外部ライブラリの最小インターフェース） ----------

interface KuromojiTokenizer {
  tokenize(text: string): KuromojiTokenData[];
}

interface KuromojiBuilder {
  build(
    callback: (err: Error | null, tokenizer: KuromojiTokenizer) => void,
  ): void;
}

interface KuromojiModule {
  builder(options: { dicPath: string }): KuromojiBuilder;
}

interface ExtractorOutput {
  tolist(): number[][];
}

type ExtractorPipeline = (
  texts: string[],
  options?: { pooling?: string; normalize?: boolean },
) => Promise<ExtractorOutput>;

// ---------- ユーティリティ ----------

function post(msg: WorkerResponse): void {
  self.postMessage(msg);
}

function postError(message: string, id?: string): void {
  post({ type: "error", id, message });
}

// ---------- kuromoji.js 初期化 ----------

async function initTokenizer(): Promise<void> {
  if (tokenizer) {
    post({ type: "init-tokenizer-done" });
    return;
  }

  post({
    type: "progress",
    source: "tokenizer",
    message: "辞書ファイルを読み込み中…",
    percent: 0,
  });

  try {
    // kuromoji は CJS モジュールなので default import が必要
    const kuromojiMod = (await import("kuromoji")) as unknown as {
      default: KuromojiModule;
    };
    const kuromoji = kuromojiMod.default ?? (kuromojiMod as unknown as KuromojiModule);

    // Vite の public ディレクトリから辞書を読み込む
    const dicPath = `${self.location.origin}/dict`;

    tokenizer = await new Promise<KuromojiTokenizer>((resolve, reject) => {
      kuromoji.builder({ dicPath }).build((err, tok) => {
        if (err) {
          reject(
            new Error(
              `kuromoji.js 辞書ロード失敗: ${err.message ?? String(err)}`,
            ),
          );
          return;
        }
        resolve(tok);
      });
    });

    post({
      type: "progress",
      source: "tokenizer",
      message: "トークナイザー準備完了",
      percent: 100,
    });
    post({ type: "init-tokenizer-done" });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "トークナイザー初期化失敗";
    postError(message);
  }
}

// ---------- Transformers.js 初期化 ----------

const EMBEDDING_MODEL = "Xenova/multilingual-e5-small";

async function initEmbedder(): Promise<void> {
  if (extractor) {
    post({ type: "init-embedder-done" });
    return;
  }

  post({
    type: "progress",
    source: "embedder",
    message: "Embedding モデルをダウンロード中…",
    percent: 0,
  });

  try {
    const { pipeline } = await import("@xenova/transformers");

    extractor = (await (
      pipeline as unknown as (
        task: string,
        model: string,
        options?: Record<string, unknown>,
      ) => Promise<ExtractorPipeline>
    )("feature-extraction", EMBEDDING_MODEL, {
      quantized: true,
      progress_callback: (info: Record<string, unknown>) => {
        const status = String(info["status"] ?? "");
        const progress = info["progress"];
        const file = info["file"];

        let message = status;
        if (file) message = `${status}: ${String(file)}`;

        post({
          type: "progress",
          source: "embedder",
          message,
          percent: typeof progress === "number" ? Math.round(progress) : undefined,
        });
      },
    })) as ExtractorPipeline;

    post({
      type: "progress",
      source: "embedder",
      message: "Embedding モデル準備完了",
      percent: 100,
    });
    post({ type: "init-embedder-done" });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Embedder 初期化失敗";
    postError(message);
  }
}

// ---------- tokenize ----------

function handleTokenize(id: string, texts: string[]): void {
  if (!tokenizer) {
    postError("トークナイザーが初期化されていません", id);
    return;
  }

  try {
    const tok = tokenizer;
    const results: KuromojiTokenData[][] = texts.map((text) =>
      tok.tokenize(text),
    );
    post({ type: "tokenize-result", id, tokens: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "トークナイズ失敗";
    postError(message, id);
  }
}

// ---------- embed ----------

const BATCH_SIZE = 128;

async function handleEmbed(id: string, texts: string[]): Promise<void> {
  if (!extractor) {
    postError("Embedder が初期化されていません", id);
    return;
  }

  try {
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      // multilingual-e5 の仕様: ドキュメントには "passage: " プレフィックスを付与
      const prefixed = batch.map((t) => `passage: ${t}`);
      const output = await extractor(prefixed, {
        pooling: "mean",
        normalize: true,
      });
      const vectors = output.tolist();
      allEmbeddings.push(...vectors);
    }

    post({ type: "embed-result", id, embeddings: allEmbeddings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Embedding 生成失敗";
    postError(message, id);
  }
}

// ---------- embed-query ----------

async function handleEmbedQuery(id: string, text: string): Promise<void> {
  if (!extractor) {
    postError("Embedder が初期化されていません", id);
    return;
  }

  try {
    // multilingual-e5 の仕様: クエリには "query: " プレフィックスを付与
    const output = await extractor([`query: ${text}`], {
      pooling: "mean",
      normalize: true,
    });
    const vectors = output.tolist();
    const first = vectors[0];
    if (!first) throw new Error("Embedding 結果が空です");
    post({ type: "embed-query-result", id, embedding: first });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "クエリ Embedding 生成失敗";
    postError(message, id);
  }
}

// ---------- メッセージハンドラ ----------

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  switch (req.type) {
    case "init-tokenizer":
      void initTokenizer();
      break;
    case "init-embedder":
      void initEmbedder();
      break;
    case "tokenize":
      handleTokenize(req.id, req.texts);
      break;
    case "embed":
      void handleEmbed(req.id, req.texts);
      break;
    case "embed-query":
      void handleEmbedQuery(req.id, req.text);
      break;
    default:
      postError(`不明なメッセージタイプ: ${(req as Record<string, string>).type}`);
  }
});
