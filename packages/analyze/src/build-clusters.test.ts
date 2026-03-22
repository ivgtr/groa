import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Tweet, TaggedTweet, Category, Sentiment } from "@groa/types";
import { TweetId, Timestamp } from "@groa/types";
import { buildClusters, splitByTime } from "./build-clusters.js";
import { computeClusterStats } from "./cluster-stats.js";

// --- テストヘルパー ---

let tweetCounter = 0;

function makeTaggedTweet(
  category: Category,
  overrides: { text?: string; sentiment?: Sentiment; timestamp?: number } = {},
): TaggedTweet {
  tweetCounter++;
  const tweet: Tweet = {
    id: TweetId(`t${tweetCounter}`),
    text: overrides.text ?? `テスト${tweetCounter}のテキストです`,
    timestamp: Timestamp(overrides.timestamp ?? Date.now() + tweetCounter),
    isRetweet: false,
    hasMedia: false,
    replyTo: null,
  };
  return {
    tweet,
    category,
    sentiment: overrides.sentiment ?? "neutral",
    topics: [],
  };
}

function makeTaggedTweets(
  category: Category,
  count: number,
  baseTimestamp?: number,
): TaggedTweet[] {
  return Array.from({ length: count }, (_, i) =>
    makeTaggedTweet(category, {
      timestamp: (baseTimestamp ?? Date.now()) + i * 1000,
    }),
  );
}

// --- テスト ---

describe("buildClusters", () => {
  beforeEach(() => {
    tweetCounter = 0;
  });

  it("空配列で空配列を返す", () => {
    expect(buildClusters([])).toHaveLength(0);
  });

  it("カテゴリ別にグルーピングする", () => {
    const tweets = [
      ...makeTaggedTweets("tech", 60),
      ...makeTaggedTweets("daily", 70),
    ];
    const clusters = buildClusters(tweets);

    expect(clusters).toHaveLength(2);

    const techCluster = clusters.find((c) => c.category === "tech");
    expect(techCluster?.tweetCount).toBe(60);

    const dailyCluster = clusters.find((c) => c.category === "daily");
    expect(dailyCluster?.tweetCount).toBe(70);
  });

  it("50件未満のカテゴリが 'other' に統合される", () => {
    const tweets = [
      ...makeTaggedTweets("tech", 100),
      ...makeTaggedTweets("opinion", 30), // < 50 → other に統合
      ...makeTaggedTweets("emotion", 20), // < 50 → other に統合
    ];
    const clusters = buildClusters(tweets);

    expect(clusters).toHaveLength(2); // tech + other

    const techCluster = clusters.find((c) => c.category === "tech");
    expect(techCluster?.tweetCount).toBe(100);

    const otherCluster = clusters.find((c) => c.category === "other");
    expect(otherCluster?.tweetCount).toBe(50); // 30 + 20
  });

  it("元の 'other' カテゴリのツイートも統合先に含まれる", () => {
    const tweets = [
      ...makeTaggedTweets("tech", 60),
      ...makeTaggedTweets("other", 15),
      ...makeTaggedTweets("creative", 10), // < 50 → other に統合
    ];
    const clusters = buildClusters(tweets);

    const otherCluster = clusters.find((c) => c.category === "other");
    expect(otherCluster?.tweetCount).toBe(25); // 15 + 10
  });

  it("全カテゴリが50件未満の場合、全て 'other' に統合し1クラスタ", () => {
    const tweets = [
      ...makeTaggedTweets("tech", 30),
      ...makeTaggedTweets("daily", 20),
      ...makeTaggedTweets("opinion", 10),
    ];
    const clusters = buildClusters(tweets);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].category).toBe("other");
    expect(clusters[0].tweetCount).toBe(60);
  });

  it("3000件超のカテゴリが時系列で分割される", () => {
    const baseTs = 1000000;
    const tweets = makeTaggedTweets("tech", 3500, baseTs);
    const clusters = buildClusters(tweets);

    // 3500件 → 2チャンクに分割
    const techClusters = clusters.filter((c) => c.category === "tech");
    expect(techClusters).toHaveLength(2);

    const totalTweets = techClusters.reduce((sum, c) => sum + c.tweetCount, 0);
    expect(totalTweets).toBe(3500);
  });

  it("tweetCount が tweets.length と一致する", () => {
    const tweets = makeTaggedTweets("tech", 80);
    const clusters = buildClusters(tweets);

    for (const cluster of clusters) {
      expect(cluster.tweetCount).toBe(cluster.tweets.length);
    }
  });
});

describe("splitByTime", () => {
  beforeEach(() => {
    tweetCounter = 0;
  });

  it("時系列順にソートされて分割される", () => {
    const tweets = [
      makeTaggedTweet("tech", { timestamp: 3000 }),
      makeTaggedTweet("tech", { timestamp: 1000 }),
      makeTaggedTweet("tech", { timestamp: 2000 }),
      makeTaggedTweet("tech", { timestamp: 4000 }),
    ];

    const chunks = splitByTime(tweets, 2);
    expect(chunks).toHaveLength(2);

    // 最初のチャンクが最も古い
    expect(chunks[0][0].tweet.timestamp).toBeLessThan(
      chunks[1][0].tweet.timestamp,
    );
  });

  it("各チャンクが maxSize 以下になる", () => {
    const tweets = makeTaggedTweets("tech", 5000);
    const chunks = splitByTime(tweets, 3000);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(3000);
    }
    // 全件が保持される
    expect(chunks.reduce((sum, c) => sum + c.length, 0)).toBe(5000);
  });

  it("maxSize 以下のデータは1チャンク", () => {
    const tweets = makeTaggedTweets("tech", 100);
    const chunks = splitByTime(tweets, 3000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(100);
  });
});

describe("computeClusterStats", () => {
  beforeEach(() => {
    tweetCounter = 0;
    vi.restoreAllMocks();
  });

  it("語尾パターン上位5件と頻出表現上位10件を返す", async () => {
    // kuromoji の実際のトークナイザーを使用
    const tweets = [
      ...Array.from({ length: 20 }, (_, i) =>
        makeTaggedTweet("tech", {
          text: `TypeScriptの型推論は素晴らしいと思う${i}`,
        }),
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        makeTaggedTweet("tech", {
          text: `プログラミングが楽しいのだ${i}`,
        }),
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        makeTaggedTweet("tech", {
          text: `Rustのメモリ安全性は最高だな${i}`,
        }),
      ),
    ];

    const cluster = {
      category: "tech" as const,
      tweets,
      tweetCount: tweets.length,
    };

    const stats = await computeClusterStats(cluster);

    expect(stats.sentenceEndings).toHaveLength(5);
    expect(stats.topTokens.length).toBeLessThanOrEqual(10);

    // 各エントリが正しい構造を持つ
    for (const ending of stats.sentenceEndings) {
      expect(ending).toHaveProperty("ending");
      expect(ending).toHaveProperty("frequency");
      expect(ending).toHaveProperty("exampleTweetIds");
    }

    for (const token of stats.topTokens) {
      expect(token).toHaveProperty("token");
      expect(token).toHaveProperty("count");
      expect(token).toHaveProperty("isNoun");
    }
  });
});
