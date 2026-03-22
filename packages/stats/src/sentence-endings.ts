/**
 * 形態素解析ベースの語尾パターン抽出。
 * 文末の助動詞・助詞・動詞活用形の組み合わせをパターン化する。
 */
import type { TweetId } from "@groa/types";
import type { KuromojiToken } from "./tokenizer.js";

export interface SentenceEnding {
  ending: string;
  frequency: number;
  exampleTweetIds: TweetId[];
}

// 語尾判定対象の品詞
const ENDING_POS = new Set([
  "助詞",
  "助動詞",
  "動詞",
  "形容詞",
  "形容動詞",
  "感動詞",
]);

// 語尾パターンの最大トークン数
const MAX_ENDING_TOKENS = 3;
const TOP_N = 20;
const EXAMPLE_COUNT = 3;

/**
 * トークナイズ済みツイート群から語尾パターンを抽出する。
 * @param tokenizedTweets ツイートごとのトークン配列とID
 * @returns 上位20件の語尾パターン（各パターンに実例ツイートID 3件紐づけ）
 */
export function extractSentenceEndings(
  tokenizedTweets: { id: TweetId; tokens: KuromojiToken[] }[],
): SentenceEnding[] {
  const patternMap = new Map<string, TweetId[]>();

  for (const { id, tokens } of tokenizedTweets) {
    const ending = extractEnding(tokens);
    if (!ending) continue;

    const ids = patternMap.get(ending) ?? [];
    ids.push(id);
    patternMap.set(ending, ids);
  }

  // 頻度順にソートし上位N件を返す
  const entries = [...patternMap.entries()]
    .map(([ending, ids]) => ({
      ending,
      frequency: ids.length,
      allIds: ids,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, TOP_N);

  return entries.map(({ ending, frequency, allIds }) => ({
    ending,
    frequency,
    exampleTweetIds: allIds.slice(0, EXAMPLE_COUNT),
  }));
}

/**
 * トークン列から語尾パターンを抽出する。
 * 文末の記号・空白を除いた末尾トークンの品詞を確認し、
 * 語尾に相当するトークンを結合してパターン文字列にする。
 */
function extractEnding(tokens: KuromojiToken[]): string | null {
  // 記号・空白を末尾から除去
  const meaningful = tokens.filter(
    (t) => t.pos !== "記号" && t.surface_form.trim() !== "",
  );

  if (meaningful.length === 0) return null;

  // 末尾から語尾に該当するトークンを収集
  const endingTokens: string[] = [];
  for (let i = meaningful.length - 1; i >= 0; i--) {
    const token = meaningful[i];
    if (!ENDING_POS.has(token.pos)) {
      // 語尾パターンの始まりに到達
      break;
    }
    endingTokens.unshift(token.surface_form);
    if (endingTokens.length >= MAX_ENDING_TOKENS) break;
  }

  // 語尾トークンが見つからなかった場合、最後のトークンの表層形を使う
  if (endingTokens.length === 0) {
    const last = meaningful[meaningful.length - 1];
    return last.surface_form;
  }

  return endingTokens.join("");
}
