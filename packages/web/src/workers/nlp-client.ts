/**
 * NLP Worker クライアント
 *
 * メインスレッドから NLP Worker を操作するための Promise ベース API。
 */

import type {
  WorkerRequest,
  WorkerResponse,
  KuromojiTokenData,
} from "./types";

/** 進捗コールバック */
export type ProgressCallback = (
  source: "tokenizer" | "embedder",
  message: string,
  percent?: number,
) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

let nextId = 0;
function generateId(): string {
  nextId += 1;
  return `req_${nextId}_${Date.now()}`;
}

export class NlpWorkerClient {
  private worker: Worker;
  private pending = new Map<string, PendingRequest>();
  private onProgress?: ProgressCallback;

  /** init-tokenizer / init-embedder 用の待機 resolver */
  private initTokenizerResolvers: {
    resolve: () => void;
    reject: (reason: unknown) => void;
  }[] = [];
  private initEmbedderResolvers: {
    resolve: () => void;
    reject: (reason: unknown) => void;
  }[] = [];

  constructor(onProgress?: ProgressCallback) {
    this.onProgress = onProgress;

    this.worker = new Worker(
      new URL("./nlp-worker.ts", import.meta.url),
      { type: "module" },
    );

    this.worker.addEventListener("message", this.handleMessage);

    this.worker.addEventListener("error", (event) => {
      const message = event.message ?? "Worker で不明なエラーが発生しました";
      // init 待機中のものをすべて reject
      for (const r of this.initTokenizerResolvers) r.reject(new Error(message));
      for (const r of this.initEmbedderResolvers) r.reject(new Error(message));
      this.initTokenizerResolvers = [];
      this.initEmbedderResolvers = [];
      // pending リクエストもすべて reject
      for (const [id, req] of this.pending) {
        req.reject(new Error(message));
        this.pending.delete(id);
      }
    });
  }

  // ---------- Public API ----------

  /** kuromoji.js トークナイザーを初期化する */
  async initTokenizer(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.initTokenizerResolvers.push({ resolve, reject });
      this.send({ type: "init-tokenizer" });
    });
  }

  /** Transformers.js Embedder を初期化する */
  async initEmbedder(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.initEmbedderResolvers.push({ resolve, reject });
      this.send({ type: "init-embedder" });
    });
  }

  /** テキスト配列を形態素解析する */
  async tokenize(texts: string[]): Promise<KuromojiTokenData[][]> {
    const id = generateId();
    return this.request<KuromojiTokenData[][]>(id, {
      type: "tokenize",
      id,
      texts,
    });
  }

  /** テキスト配列の Embedding を生成する（passage プレフィックス付き） */
  async embed(texts: string[]): Promise<number[][]> {
    const id = generateId();
    return this.request<number[][]>(id, { type: "embed", id, texts });
  }

  /** 検索クエリの Embedding を生成する（query プレフィックス付き） */
  async embedQuery(text: string): Promise<number[]> {
    const id = generateId();
    return this.request<number[]>(id, { type: "embed-query", id, text });
  }

  /** Worker を終了する */
  terminate(): void {
    this.worker.terminate();
    // 残っている pending をすべて reject
    for (const [, req] of this.pending) {
      req.reject(new Error("Worker が終了されました"));
    }
    this.pending.clear();
    for (const r of this.initTokenizerResolvers) {
      r.reject(new Error("Worker が終了されました"));
    }
    for (const r of this.initEmbedderResolvers) {
      r.reject(new Error("Worker が終了されました"));
    }
    this.initTokenizerResolvers = [];
    this.initEmbedderResolvers = [];
  }

  // ---------- 内部メソッド ----------

  private send(msg: WorkerRequest): void {
    this.worker.postMessage(msg);
  }

  private request<T>(id: string, msg: WorkerRequest): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.send(msg);
    });
  }

  private handleMessage = (event: MessageEvent<WorkerResponse>): void => {
    const res = event.data;

    switch (res.type) {
      case "init-tokenizer-done": {
        const resolvers = this.initTokenizerResolvers;
        this.initTokenizerResolvers = [];
        for (const r of resolvers) r.resolve();
        break;
      }

      case "init-embedder-done": {
        const resolvers = this.initEmbedderResolvers;
        this.initEmbedderResolvers = [];
        for (const r of resolvers) r.resolve();
        break;
      }

      case "tokenize-result": {
        const pending = this.pending.get(res.id);
        if (pending) {
          this.pending.delete(res.id);
          pending.resolve(res.tokens);
        }
        break;
      }

      case "embed-result": {
        const pending = this.pending.get(res.id);
        if (pending) {
          this.pending.delete(res.id);
          pending.resolve(res.embeddings);
        }
        break;
      }

      case "embed-query-result": {
        const pending = this.pending.get(res.id);
        if (pending) {
          this.pending.delete(res.id);
          pending.resolve(res.embedding);
        }
        break;
      }

      case "progress":
        this.onProgress?.(res.source, res.message, res.percent);
        break;

      case "error": {
        if (res.id) {
          const pending = this.pending.get(res.id);
          if (pending) {
            this.pending.delete(res.id);
            pending.reject(new Error(res.message));
          }
        }
        // id がないエラーは init 系の失敗の可能性がある
        // (init 待機がなければ何もしない)
        if (!res.id) {
          if (this.initTokenizerResolvers.length > 0) {
            const resolvers = this.initTokenizerResolvers;
            this.initTokenizerResolvers = [];
            for (const r of resolvers) r.reject(new Error(res.message));
          }
          if (this.initEmbedderResolvers.length > 0) {
            const resolvers = this.initEmbedderResolvers;
            this.initEmbedderResolvers = [];
            for (const r of resolvers) r.reject(new Error(res.message));
          }
        }
        break;
      }
    }
  };
}
