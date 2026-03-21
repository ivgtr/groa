import { describe, it, expect } from "vitest";
import {
  TweetSchema,
  TweetCorpusSchema,
  CorpusMetadataSchema,
  DateRangeSchema,
} from "./input.js";

const validTweet = {
  id: "tweet-001",
  text: "テストツイートです",
  timestamp: 1700000000000,
  isRetweet: false,
  hasMedia: false,
  replyTo: null,
};

const validTweetWithReply = {
  ...validTweet,
  id: "tweet-002",
  replyTo: "tweet-001",
};

describe("DateRangeSchema", () => {
  it("有効な日付範囲をパースできる", () => {
    const result = DateRangeSchema.safeParse({
      start: 1700000000000,
      end: 1700100000000,
    });
    expect(result.success).toBe(true);
  });

  it("フィールド不足を拒否する", () => {
    const result = DateRangeSchema.safeParse({ start: 1700000000000 });
    expect(result.success).toBe(false);
  });
});

describe("CorpusMetadataSchema", () => {
  it("有効なメタデータをパースできる", () => {
    const result = CorpusMetadataSchema.safeParse({
      totalCount: 1000,
      dateRange: { start: 1700000000000, end: 1700100000000 },
      filteredCount: 50,
    });
    expect(result.success).toBe(true);
  });
});

describe("TweetSchema", () => {
  it("有効なツイートをパースできる", () => {
    const result = TweetSchema.safeParse(validTweet);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("tweet-001");
      expect(result.data.replyTo).toBeNull();
    }
  });

  it("replyTo 付きツイートをパースできる", () => {
    const result = TweetSchema.safeParse(validTweetWithReply);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.replyTo).toBe("tweet-001");
    }
  });

  it("必須フィールド不足を拒否する", () => {
    const result = TweetSchema.safeParse({ id: "tweet-001" });
    expect(result.success).toBe(false);
  });

  it("型の不一致を拒否する", () => {
    const result = TweetSchema.safeParse({
      ...validTweet,
      timestamp: "not-a-number",
    });
    expect(result.success).toBe(false);
  });
});

describe("TweetCorpusSchema", () => {
  it("有効なコーパスをパースできる", () => {
    const result = TweetCorpusSchema.safeParse({
      tweets: [validTweet, validTweetWithReply],
      metadata: {
        totalCount: 100,
        dateRange: { start: 1700000000000, end: 1700100000000 },
        filteredCount: 10,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tweets).toHaveLength(2);
      expect(result.data.metadata.totalCount).toBe(100);
    }
  });

  it("空のツイート配列をパースできる", () => {
    const result = TweetCorpusSchema.safeParse({
      tweets: [],
      metadata: {
        totalCount: 0,
        dateRange: { start: 1700000000000, end: 1700000000000 },
        filteredCount: 0,
      },
    });
    expect(result.success).toBe(true);
  });

  it("不正なツイートを含むコーパスを拒否する", () => {
    const result = TweetCorpusSchema.safeParse({
      tweets: [{ invalid: true }],
      metadata: {
        totalCount: 1,
        dateRange: { start: 1700000000000, end: 1700100000000 },
        filteredCount: 0,
      },
    });
    expect(result.success).toBe(false);
  });
});
