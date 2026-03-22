/**
 * 句読点パターンの抽出。
 * sentenceEnders: 文末記号の出現頻度
 * commaStyle: 読点の種類と出現頻度
 * bracketStyles: 括弧の種類と出現頻度
 */

export interface Punctuation {
  sentenceEnders: Record<string, number>;
  commaStyle: Record<string, number>;
  bracketStyles: Record<string, number>;
}

// 文末記号パターン
const SENTENCE_ENDERS = [
  "。",
  "！",
  "!",
  "？",
  "?",
  "…",
  "...",
  "．",
  "w",
  "W",
  "ｗ",
  "〜",
  "～",
] as const;

// 読点パターン
const COMMAS = ["、", ",", "，"] as const;

// 括弧パターン（開き括弧のみカウント）
const BRACKETS = [
  "（",
  "(",
  "「",
  "『",
  "【",
  "〈",
  "《",
  "〔",
  "［",
  "[",
] as const;

/**
 * テキスト群から句読点パターンを抽出する。
 * @param texts 分析対象テキストの配列
 */
export function extractPunctuation(texts: string[]): Punctuation {
  const sentenceEnders: Record<string, number> = {};
  const commaStyle: Record<string, number> = {};
  const bracketStyles: Record<string, number> = {};

  for (const text of texts) {
    // 文末記号
    const trimmed = text.trimEnd();
    if (trimmed.length > 0) {
      const ender = detectSentenceEnder(trimmed);
      sentenceEnders[ender] = (sentenceEnders[ender] ?? 0) + 1;
    }

    // 読点
    for (const comma of COMMAS) {
      const count = countOccurrences(text, comma);
      if (count > 0) {
        commaStyle[comma] = (commaStyle[comma] ?? 0) + count;
      }
    }

    // 括弧
    for (const bracket of BRACKETS) {
      const count = countOccurrences(text, bracket);
      if (count > 0) {
        bracketStyles[bracket] = (bracketStyles[bracket] ?? 0) + count;
      }
    }
  }

  return { sentenceEnders, commaStyle, bracketStyles };
}

/**
 * テキストの文末記号を検出する。
 * 末尾から最長マッチで検出し、該当しなければ "なし" を返す。
 */
function detectSentenceEnder(text: string): string {
  const tail = text.slice(-3);

  // "..." の検出
  if (tail.endsWith("...")) return "...";

  // 末尾1文字の検出
  const lastChar = text[text.length - 1];

  // "w" の連続（末尾がwで終わる場合）
  if (lastChar === "w" || lastChar === "W" || lastChar === "ｗ") {
    return lastChar;
  }

  for (const ender of SENTENCE_ENDERS) {
    if (lastChar === ender) return ender;
  }

  return "なし";
}

function countOccurrences(text: string, char: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(char, pos)) !== -1) {
    count++;
    pos += char.length;
  }
  return count;
}
