/**
 * 文字種比率を算出する。
 */
export interface CharTypeRatio {
  hiragana: number;
  katakana: number;
  kanji: number;
  ascii: number;
  emoji: number;
}

// Unicode 範囲定義
const HIRAGANA_RE = /[\u3040-\u309F]/;
const KATAKANA_RE = /[\u30A0-\u30FF\u31F0-\u31FF\uFF65-\uFF9F]/;
const KANJI_RE =
  /[\u4E00-\u9FFF\u3400-\u4DBF\u{20000}-\u{2A6DF}\u{2A700}-\u{2B73F}\u{2B740}-\u{2B81F}]/u;
const ASCII_RE = /[\u0020-\u007E]/;

// 絵文字検出（Extended_Pictographic + Emoji_Component は除外）
const EMOJI_RE = /\p{Extended_Pictographic}/u;

/**
 * テキスト群の文字種比率を計算する。
 * @param texts 分析対象テキストの配列
 * @returns 各文字種の出現比率（合計が1.0以下）
 */
export function calcCharTypeRatio(texts: string[]): CharTypeRatio {
  let hiragana = 0;
  let katakana = 0;
  let kanji = 0;
  let ascii = 0;
  let emoji = 0;
  let total = 0;

  for (const text of texts) {
    for (const char of text) {
      total++;
      if (EMOJI_RE.test(char)) {
        emoji++;
      } else if (HIRAGANA_RE.test(char)) {
        hiragana++;
      } else if (KATAKANA_RE.test(char)) {
        katakana++;
      } else if (KANJI_RE.test(char)) {
        kanji++;
      } else if (ASCII_RE.test(char)) {
        ascii++;
      }
    }
  }

  if (total === 0) {
    return { hiragana: 0, katakana: 0, kanji: 0, ascii: 0, emoji: 0 };
  }

  return {
    hiragana: round(hiragana / total),
    katakana: round(katakana / total),
    kanji: round(kanji / total),
    ascii: round(ascii / total),
    emoji: round(emoji / total),
  };
}

function round(n: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
