import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";
import { TweetSchema } from "./input.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "..", "..", "test", "fixtures");

function loadSyntheticTweets(): z.infer<typeof TweetSchema>[] {
  const raw = readFileSync(
    join(FIXTURES_DIR, "synthetic-tweets.json"),
    "utf-8",
  );
  const data = JSON.parse(raw) as unknown;
  return z.array(TweetSchema).parse(data);
}

describe("合成ツイートデータセット", () => {
  it("100件のツイートが含まれている", () => {
    const tweets = loadSyntheticTweets();
    expect(tweets).toHaveLength(100);
  });

  it("全ツイートが Tweet Zod スキーマに適合する", () => {
    // loadSyntheticTweets 内で z.array(TweetSchema).parse() が
    // 成功しているためバリデーション通過。追加検証を行う。
    const tweets = loadSyntheticTweets();
    for (const tweet of tweets) {
      expect(tweet).toHaveProperty("id");
      expect(tweet).toHaveProperty("text");
      expect(tweet).toHaveProperty("timestamp");
      expect(typeof tweet.isRetweet).toBe("boolean");
      expect(typeof tweet.hasMedia).toBe("boolean");
    }
  });

  it("リツイートが含まれている", () => {
    const tweets = loadSyntheticTweets();
    expect(tweets.filter((t) => t.isRetweet).length).toBeGreaterThan(0);
  });

  it("リプライが含まれている", () => {
    const tweets = loadSyntheticTweets();
    expect(tweets.filter((t) => t.replyTo !== null).length).toBeGreaterThan(0);
  });

  it("IDがユニークである", () => {
    const tweets = loadSyntheticTweets();
    const ids = new Set(tweets.map((t) => t.id));
    expect(ids.size).toBe(tweets.length);
  });

  it("タイムスタンプが2025年の範囲にある", () => {
    const tweets = loadSyntheticTweets();
    const jan2025 = new Date("2025-01-01").getTime();
    const jan2026 = new Date("2026-01-01").getTime();

    for (const tweet of tweets) {
      expect(tweet.timestamp as number).toBeGreaterThanOrEqual(jan2025);
      expect(tweet.timestamp as number).toBeLessThan(jan2026);
    }
  });
});
