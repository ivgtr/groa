/**
 * Web Worker 通信用の型定義
 *
 * メインスレッドと NLP Worker 間のメッセージプロトコルを定義する。
 */

/** メインスレッド -> Worker へ送るリクエスト */
export type WorkerRequest =
  | { type: "init-tokenizer" }
  | { type: "init-embedder" }
  | { type: "tokenize"; id: string; texts: string[] }
  | { type: "embed"; id: string; texts: string[] }
  | { type: "embed-query"; id: string; text: string };

/** Worker -> メインスレッドへ返すレスポンス */
export type WorkerResponse =
  | { type: "init-tokenizer-done" }
  | { type: "init-embedder-done" }
  | { type: "tokenize-result"; id: string; tokens: KuromojiTokenData[][] }
  | { type: "embed-result"; id: string; embeddings: number[][] }
  | { type: "embed-query-result"; id: string; embedding: number[] }
  | {
      type: "progress";
      source: "tokenizer" | "embedder";
      message: string;
      percent?: number;
    }
  | { type: "error"; id?: string; message: string };

/**
 * kuromoji.js のトークン情報（Worker 境界を超えるため plain object）
 *
 * kuromoji.IpadicFeatures と同等のフィールドを保持する。
 */
export interface KuromojiTokenData {
  word_id: number;
  word_type: string;
  word_position: number;
  surface_form: string;
  pos: string;
  pos_detail_1: string;
  pos_detail_2: string;
  pos_detail_3: string;
  conjugated_type: string;
  conjugated_form: string;
  basic_form: string;
  reading?: string;
  pronunciation?: string;
}
