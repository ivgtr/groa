import type { TaggedTweet, TopicCluster, Category } from "@groa/types";
import { CATEGORIES } from "@groa/types";

const MIN_CLUSTER_SIZE = 50;
const MAX_CLUSTER_SIZE = 3000;

/**
 * TaggedTweet[] をカテゴリ別にグルーピングし TopicCluster[] を構築する。
 *
 * - 50件未満のカテゴリは "other" に統合
 * - 3000件超のカテゴリは時系列で分割
 * - 全カテゴリが50件未満の場合、全て "other" に統合し1クラスタで続行
 */
export function buildClusters(taggedTweets: TaggedTweet[]): TopicCluster[] {
  if (taggedTweets.length === 0) return [];

  const groups = groupByCategory(taggedTweets);

  // 全カテゴリが50件未満 → 単一 "other" クラスタ
  const allSmall = [...groups.values()].every(
    (g) => g.length < MIN_CLUSTER_SIZE,
  );
  if (allSmall) {
    return [
      {
        category: "other",
        tweets: taggedTweets,
        tweetCount: taggedTweets.length,
      },
    ];
  }

  const clusters: TopicCluster[] = [];
  const otherTweets: TaggedTweet[] = [...(groups.get("other") ?? [])];
  groups.delete("other");

  for (const [category, tweets] of groups) {
    if (tweets.length < MIN_CLUSTER_SIZE) {
      otherTweets.push(...tweets);
      continue;
    }

    if (tweets.length > MAX_CLUSTER_SIZE) {
      const chunks = splitByTime(tweets, MAX_CLUSTER_SIZE);
      for (const chunk of chunks) {
        clusters.push({
          category: category as Category,
          tweets: chunk,
          tweetCount: chunk.length,
        });
      }
    } else {
      clusters.push({
        category: category as Category,
        tweets,
        tweetCount: tweets.length,
      });
    }
  }

  if (otherTweets.length > 0) {
    clusters.push({
      category: "other",
      tweets: otherTweets,
      tweetCount: otherTweets.length,
    });
  }

  return clusters;
}

/** カテゴリ別にグルーピングする */
function groupByCategory(
  tweets: TaggedTweet[],
): Map<string, TaggedTweet[]> {
  const groups = new Map<string, TaggedTweet[]>();

  // 全カテゴリを初期化（空グループ含む）
  for (const cat of CATEGORIES) {
    groups.set(cat, []);
  }

  for (const tweet of tweets) {
    const group = groups.get(tweet.category);
    if (group) {
      group.push(tweet);
    } else {
      // 未知のカテゴリは "other" に振り分け
      groups.get("other")?.push(tweet);
    }
  }

  // 空のカテゴリを除去
  for (const [key, value] of groups) {
    if (value.length === 0) groups.delete(key);
  }

  return groups;
}

/** 時系列で分割する（各チャンクが maxSize 以下になるように） */
export function splitByTime(
  tweets: TaggedTweet[],
  maxSize: number,
): TaggedTweet[][] {
  const sorted = [...tweets].sort(
    (a, b) => a.tweet.timestamp - b.tweet.timestamp,
  );
  const numChunks = Math.ceil(sorted.length / maxSize);
  const chunkSize = Math.ceil(sorted.length / numChunks);

  const chunks: TaggedTweet[][] = [];
  for (let i = 0; i < sorted.length; i += chunkSize) {
    chunks.push(sorted.slice(i, i + chunkSize));
  }
  return chunks;
}

export { MIN_CLUSTER_SIZE, MAX_CLUSTER_SIZE };
