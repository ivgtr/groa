/**
 * 頻出語彙・n-gram 抽出。
 */
import type { KuromojiToken } from "./tokenizer.js";

export interface TokenEntry {
  token: string;
  count: number;
  isNoun: boolean;
}

export interface NgramEntry {
  ngram: string;
  count: number;
}

// ストップワード対象品詞（助詞・助動詞・記号等）
const STOPWORD_POS = new Set([
  "助詞",
  "助動詞",
  "記号",
  "接続詞",
  "フィラー",
]);

const CONTENT_POS = new Set(["名詞", "動詞", "形容詞", "形容動詞", "副詞"]);

const TOP_TOKENS = 50;
const TOP_NGRAMS = 20;

/**
 * トークナイズ済みテキスト群から頻出語彙を抽出する。
 * ストップワード（助詞・助動詞・記号等）を除外し、上位50件を返す。
 */
export function extractTopTokens(
  tokenizedTexts: KuromojiToken[][],
): TokenEntry[] {
  const counts = new Map<string, { count: number; isNoun: boolean }>();

  for (const tokens of tokenizedTexts) {
    for (const token of tokens) {
      if (STOPWORD_POS.has(token.pos)) continue;
      if (!CONTENT_POS.has(token.pos)) continue;
      if (token.surface_form.trim() === "") continue;

      const key = token.surface_form;
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, { count: 1, isNoun: token.pos === "名詞" });
      }
    }
  }

  return [...counts.entries()]
    .map(([token, { count, isNoun }]) => ({ token, count, isNoun }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_TOKENS);
}

/**
 * トークナイズ済みテキスト群から形態素n-gramを抽出する。
 */
export function extractNgrams(
  tokenizedTexts: KuromojiToken[][],
): { bigrams: NgramEntry[]; trigrams: NgramEntry[] } {
  const bigramCounts = new Map<string, number>();
  const trigramCounts = new Map<string, number>();

  for (const tokens of tokenizedTexts) {
    const surfaces = tokens
      .filter((t) => t.pos !== "記号" && t.surface_form.trim() !== "")
      .map((t) => t.surface_form);

    for (let i = 0; i < surfaces.length - 1; i++) {
      const bigram = `${surfaces[i]}${surfaces[i + 1]}`;
      bigramCounts.set(bigram, (bigramCounts.get(bigram) ?? 0) + 1);
    }

    for (let i = 0; i < surfaces.length - 2; i++) {
      const trigram = `${surfaces[i]}${surfaces[i + 1]}${surfaces[i + 2]}`;
      trigramCounts.set(trigram, (trigramCounts.get(trigram) ?? 0) + 1);
    }
  }

  return {
    bigrams: topN(bigramCounts, TOP_NGRAMS),
    trigrams: topN(trigramCounts, TOP_NGRAMS),
  };
}

function topN(map: Map<string, number>, n: number): NgramEntry[] {
  return [...map.entries()]
    .map(([ngram, count]) => ({ ngram, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
