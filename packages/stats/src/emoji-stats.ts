/**
 * 絵文字の使用統計。
 */

export interface EmojiEntry {
  emoji: string;
  count: number;
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const TOP_EMOJI = 10;

/**
 * テキスト群から絵文字の使用頻度を集計し、上位10件を返す。
 */
export function extractTopEmoji(texts: string[]): EmojiEntry[] {
  const counts = new Map<string, number>();

  for (const text of texts) {
    const matches = text.match(EMOJI_RE);
    if (!matches) continue;

    for (const emoji of matches) {
      counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_EMOJI);
}
