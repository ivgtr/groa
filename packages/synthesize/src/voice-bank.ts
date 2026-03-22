import type {
  ClusterAnalysis,
  TaggedTweet,
  Category,
  VoiceBankEntry,
} from "@groa/types";

const TARGET_MIN = 20;
const TARGET_MAX = 30;
const MIN_PER_CATEGORY = 2;

/**
 * 各クラスタの representativeTweets からボイスバンクを選定する。
 * カテゴリの多様性とセンチメントの多様性を確保する。
 */
export function selectVoiceBank(
  analyses: ClusterAnalysis[],
): VoiceBankEntry[] {
  const allReps: { tweet: TaggedTweet; category: Category }[] = [];
  for (const a of analyses) {
    for (const t of a.representativeTweets) {
      allReps.push({ tweet: t, category: a.category });
    }
  }

  if (allReps.length === 0) return [];

  const target = Math.min(TARGET_MAX, Math.max(TARGET_MIN, allReps.length));
  const categories = [...new Set(analyses.map((a) => a.category))];

  const selected: VoiceBankEntry[] = [];
  const usedIds = new Set<string>();

  const pick = (tweet: TaggedTweet, reason: string): boolean => {
    if (usedIds.has(tweet.tweet.id)) return false;
    selected.push({ tweet, selectionReason: reason });
    usedIds.add(tweet.tweet.id);
    return true;
  };

  // Phase 1: 各カテゴリから最低2件（センチメント多様性を優先）
  for (const cat of categories) {
    const catTweets = allReps.filter((r) => r.category === cat);
    const sentiments = [...new Set(catTweets.map((r) => r.tweet.sentiment))];

    let count = 0;
    for (const sent of sentiments) {
      if (count >= MIN_PER_CATEGORY) break;
      const t = catTweets.find(
        (r) => r.tweet.sentiment === sent && !usedIds.has(r.tweet.tweet.id),
      );
      if (t && pick(t.tweet, `${cat}カテゴリ代表（${sent}）`)) {
        count++;
      }
    }
    while (count < MIN_PER_CATEGORY) {
      const t = catTweets.find((r) => !usedIds.has(r.tweet.tweet.id));
      if (!t) break;
      if (pick(t.tweet, `${cat}カテゴリ代表`)) count++;
    }
  }

  // Phase 2: ラウンドロビンで残りを埋める
  let catIdx = 0;
  let exhausted = 0;
  while (selected.length < target && exhausted < categories.length) {
    const cat = categories[catIdx % categories.length];
    const remaining = allReps.filter(
      (r) => r.category === cat && !usedIds.has(r.tweet.tweet.id),
    );
    if (remaining.length > 0) {
      pick(remaining[0].tweet, `${cat}カテゴリの多様性確保`);
      exhausted = 0;
    } else {
      exhausted++;
    }
    catIdx++;
  }

  return selected;
}

export { TARGET_MIN, TARGET_MAX, MIN_PER_CATEGORY };
