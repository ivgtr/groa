import kuromoji from "kuromoji";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";

export type KuromojiToken = kuromoji.IpadicFeatures;

let tokenizerInstance: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null =
  null;

/**
 * kuromoji.js トークナイザーを初期化して返す。
 * 2回目以降はキャッシュ済みインスタンスを返す。
 */
export async function getTokenizer(): Promise<
  kuromoji.Tokenizer<kuromoji.IpadicFeatures>
> {
  if (tokenizerInstance) return tokenizerInstance;

  const require = createRequire(import.meta.url);
  const kuromojiPath = dirname(require.resolve("kuromoji/package.json"));
  const dicPath = join(kuromojiPath, "dict");

  return new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath })
      .build((err, tokenizer) => {
        if (err) {
          reject(
            new Error(
              `kuromoji.js の辞書ロードに失敗しました: ${err.message ?? String(err)}`,
            ),
          );
          return;
        }
        tokenizerInstance = tokenizer;
        resolve(tokenizer);
      });
  });
}

/** テスト用: キャッシュされたトークナイザーをクリアする */
export function resetTokenizer(): void {
  tokenizerInstance = null;
}
