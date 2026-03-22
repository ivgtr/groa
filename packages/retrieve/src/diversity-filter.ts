import type { TaggedTweet } from "@groa/types";

export interface ScoredCandidate {
  taggedTweet: TaggedTweet;
  similarity: number;
}

/**
 * 候補群から多様性を確保しつつ target 件を選定する。
 * グリーディ選択: 類似度が高い順に、多様性条件を満たすものを優先的に追加。
 * 条件を満たす候補がない場合は類似度最上位をフォールバックで追加。
 *
 * @param candidates - 類似度降順でソート済みの候補リスト
 * @param target - 選定する件数
 */
export function diversityFilter(
  candidates: ScoredCandidate[],
  target: number,
  sentimentDiversity: boolean,
  categoryDiversity: boolean,
): ScoredCandidate[] {
  if (!sentimentDiversity && !categoryDiversity) {
    return candidates.slice(0, target);
  }

  const selected: ScoredCandidate[] = [];
  const remaining = [...candidates];
  const sentimentCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();

  // 各属性の上限: target の半数を超えないようにする
  const maxPerSentiment = Math.ceil(target / 2);
  const maxPerCategory = Math.ceil(target / 2);

  while (selected.length < target && remaining.length > 0) {
    let bestIdx = -1;

    // 多様性条件を満たす最高スコアの候補を探す
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      let acceptable = true;

      if (sentimentDiversity) {
        const count = sentimentCounts.get(candidate.taggedTweet.sentiment) ?? 0;
        if (count >= maxPerSentiment) acceptable = false;
      }

      if (categoryDiversity) {
        const count = categoryCounts.get(candidate.taggedTweet.category) ?? 0;
        if (count >= maxPerCategory) acceptable = false;
      }

      if (acceptable) {
        bestIdx = i;
        break; // candidates はスコア降順なので最初に見つかったものが最高スコア
      }
    }

    // 多様性条件を満たす候補がない場合、最高スコアをフォールバック選択
    if (bestIdx === -1) {
      bestIdx = 0;
    }

    const candidate = remaining[bestIdx]!;
    selected.push(candidate);
    remaining.splice(bestIdx, 1);

    const { sentiment, category } = candidate.taggedTweet;
    sentimentCounts.set(sentiment, (sentimentCounts.get(sentiment) ?? 0) + 1);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  return selected;
}
