import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Tweet } from "@groa/types";
import { TweetId, Timestamp } from "@groa/types";
import {
  preprocess,
  ValidationError,
  normalize,
  replaceUrls,
  removeMentions,
  normalizeWhitespace,
  isRetweet,
  isUrlOnly,
  isTooShort,
  isBoilerplate,
  createDefaultFilters,
} from "./index.js";

function makeTweet(overrides: Partial<Tweet> & { text: string }): Tweet {
  return {
    id: TweetId(`tweet-${Math.random().toString(36).slice(2, 8)}`),
    timestamp: Timestamp(Date.now()),
    isRetweet: false,
    hasMedia: false,
    replyTo: null,
    ...overrides,
  };
}

function makeTweets(count: number, base?: Partial<Tweet>): Tweet[] {
  return Array.from({ length: count }, (_, i) =>
    makeTweet({
      text: `テスト投稿 ${i + 1} です。これは十分な長さのテキストです。`,
      id: TweetId(`tweet-${i}`),
      timestamp: Timestamp(1700000000000 + i * 1000),
      ...base,
    }),
  );
}

// --- テキスト正規化 ---

describe("normalizers", () => {
  describe("replaceUrls", () => {
    it("http URLを [URL] に置換する", () => {
      expect(replaceUrls("見て http://example.com")).toBe("見て [URL]");
    });

    it("https URLを [URL] に置換する", () => {
      expect(replaceUrls("見て https://example.com/path?q=1")).toBe(
        "見て [URL]",
      );
    });

    it("複数のURLを全て置換する", () => {
      expect(
        replaceUrls("https://a.com と https://b.com を参照"),
      ).toBe("[URL] と [URL] を参照");
    });

    it("URLがないテキストは変更しない", () => {
      expect(replaceUrls("URLなし")).toBe("URLなし");
    });
  });

  describe("removeMentions", () => {
    it("@ユーザー名を除去する", () => {
      expect(removeMentions("@user こんにちは")).toBe(" こんにちは");
    });

    it("複数のメンションを全て除去する", () => {
      expect(removeMentions("@a @b ありがとう")).toBe("  ありがとう");
    });

    it("メンションがないテキストは変更しない", () => {
      expect(removeMentions("メンションなし")).toBe("メンションなし");
    });
  });

  describe("normalizeWhitespace", () => {
    it("連続する空白を単一スペースにする", () => {
      expect(normalizeWhitespace("a   b")).toBe("a b");
    });

    it("前後の空白を除去する", () => {
      expect(normalizeWhitespace("  hello  ")).toBe("hello");
    });

    it("改行・タブも正規化する", () => {
      expect(normalizeWhitespace("a\n\n\tb")).toBe("a b");
    });
  });

  describe("normalize（チェーン適用）", () => {
    it("URL置換 → メンション除去 → 空白正規化の順で処理する", () => {
      expect(normalize("@user  https://example.com  こんにちは")).toBe(
        "[URL] こんにちは",
      );
    });
  });
});

// --- フィルタ ---

describe("filters", () => {
  describe("isRetweet", () => {
    it("リツイートを除外する", () => {
      expect(isRetweet(makeTweet({ text: "RT", isRetweet: true }))).toBe(true);
    });

    it("通常ツイートは除外しない", () => {
      expect(isRetweet(makeTweet({ text: "通常", isRetweet: false }))).toBe(
        false,
      );
    });
  });

  describe("isUrlOnly", () => {
    it("[URL]のみのテキストを除外する", () => {
      expect(isUrlOnly(makeTweet({ text: "[URL]" }))).toBe(true);
    });

    it("複数[URL]のみのテキストを除外する", () => {
      expect(isUrlOnly(makeTweet({ text: "[URL] [URL]" }))).toBe(true);
    });

    it("URL以外のテキストがあれば除外しない", () => {
      expect(isUrlOnly(makeTweet({ text: "[URL] を参照" }))).toBe(false);
    });

    it("空テキストを除外する", () => {
      expect(isUrlOnly(makeTweet({ text: "" }))).toBe(true);
    });
  });

  describe("isTooShort", () => {
    it("最小文字数未満のテキストを除外する", () => {
      expect(isTooShort(5)(makeTweet({ text: "あいう" }))).toBe(true);
    });

    it("最小文字数以上のテキストは除外しない", () => {
      expect(isTooShort(5)(makeTweet({ text: "あいうえお" }))).toBe(false);
    });

    it("ちょうど最小文字数のテキストは除外しない", () => {
      expect(isTooShort(3)(makeTweet({ text: "あいう" }))).toBe(false);
    });
  });

  describe("isBoilerplate", () => {
    it("パターンに一致するテキストを除外する", () => {
      const filter = isBoilerplate([/^定期：/]);
      expect(filter(makeTweet({ text: "定期：フォローよろしく" }))).toBe(true);
    });

    it("パターンに一致しないテキストは除外しない", () => {
      const filter = isBoilerplate([/^定期：/]);
      expect(filter(makeTweet({ text: "今日は天気がいい" }))).toBe(false);
    });

    it("複数パターンのいずれかに一致すれば除外する", () => {
      const filter = isBoilerplate([/^定期：/, /^#拡散希望/]);
      expect(filter(makeTweet({ text: "#拡散希望 イベント" }))).toBe(true);
    });
  });

  describe("createDefaultFilters", () => {
    it("デフォルトで retweet, urlOnly, tooShort フィルタを含む", () => {
      const filters = createDefaultFilters();
      expect(filters.length).toBeGreaterThanOrEqual(3);
    });

    it("boilerplatePatterns 指定時にフィルタが追加される", () => {
      const withoutBp = createDefaultFilters();
      const withBp = createDefaultFilters({
        boilerplatePatterns: ["^定期："],
      });
      expect(withBp.length).toBe(withoutBp.length + 1);
    });
  });
});

// --- preprocess メイン関数 ---

describe("preprocess", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("正常なツイート群をTweetCorpusに変換する", () => {
    const tweets = makeTweets(20);
    const corpus = preprocess(tweets);

    expect(corpus.tweets.length).toBe(20);
    expect(corpus.metadata.totalCount).toBe(20);
    expect(corpus.metadata.filteredCount).toBe(0);
  });

  it("URLが [URL] に置換される", () => {
    const tweets = makeTweets(10, {
      text: "見て https://example.com 面白い",
    });
    const corpus = preprocess(tweets);

    expect(corpus.tweets[0].text).toBe("見て [URL] 面白い");
  });

  it("メンションが除去される", () => {
    const tweets = makeTweets(10, { text: "@user こんにちは！元気ですか？" });
    const corpus = preprocess(tweets);

    expect(corpus.tweets[0].text).toBe("こんにちは！元気ですか？");
  });

  it("連続する空白が正規化される", () => {
    const tweets = makeTweets(10, { text: "  hello   world  テスト " });
    const corpus = preprocess(tweets);

    expect(corpus.tweets[0].text).toBe("hello world テスト");
  });

  it("リツイートが除外される", () => {
    const tweets = [
      ...makeTweets(10),
      makeTweet({ text: "RTされたツイート", isRetweet: true }),
    ];
    const corpus = preprocess(tweets);

    expect(corpus.tweets.length).toBe(10);
    expect(corpus.metadata.filteredCount).toBe(1);
  });

  it("URLのみのツイートが除外される", () => {
    const tweets = [
      ...makeTweets(10),
      makeTweet({ text: "https://example.com" }),
    ];
    const corpus = preprocess(tweets);

    expect(corpus.tweets.length).toBe(10);
    expect(corpus.metadata.filteredCount).toBe(1);
  });

  it("短すぎるツイートが除外される（デフォルト5文字）", () => {
    const tweets = [...makeTweets(10), makeTweet({ text: "短い" })];
    const corpus = preprocess(tweets);

    expect(corpus.tweets.length).toBe(10);
    expect(corpus.metadata.filteredCount).toBe(1);
  });

  it("minTweetLength オプションで最小文字数を変更できる", () => {
    const tweets = [...makeTweets(10), makeTweet({ text: "1234" })];
    const corpus = preprocess(tweets, { minTweetLength: 3 });

    expect(corpus.tweets.length).toBe(11);
  });

  it("ボイラープレートパターンで除外できる", () => {
    const tweets = [
      ...makeTweets(10),
      makeTweet({ text: "定期：フォローお願いします！" }),
    ];
    const corpus = preprocess(tweets, {
      boilerplatePatterns: ["^定期："],
    });

    expect(corpus.tweets.length).toBe(10);
    expect(corpus.metadata.filteredCount).toBe(1);
  });

  it("CorpusMetadata の dateRange が正しく集計される", () => {
    const tweets = [
      makeTweet({
        text: "最初のツイートです。これは十分長い。",
        timestamp: Timestamp(1000),
      }),
      makeTweet({
        text: "最後のツイートです。これも十分長い。",
        timestamp: Timestamp(9000),
      }),
      ...makeTweets(10, { timestamp: Timestamp(5000) }),
    ];
    const corpus = preprocess(tweets);

    expect(corpus.metadata.dateRange.start).toBe(1000);
    expect(corpus.metadata.dateRange.end).toBe(9000);
  });

  // --- バリデーション ---

  it("入力0件で VALIDATION_ERROR を投げる", () => {
    expect(() => preprocess([])).toThrow(ValidationError);
    expect(() => preprocess([])).toThrow("入力ツイートが0件です");
  });

  it("前処理後0件で警告とエラーを出す", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tweets = makeTweets(5, { isRetweet: true });

    expect(() => preprocess(tweets)).toThrow(
      "前処理後のツイートが0件のため",
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("フィルタ条件の緩和"),
    );
  });

  it("前処理後10件未満でエラー停止する", () => {
    const tweets = makeTweets(9);
    const retweetTweets = makeTweets(5, { isRetweet: true });

    expect(() => preprocess([...tweets, ...retweetTweets])).toThrow(
      "最低 10 件必要",
    );
  });

  it("前処理後100件未満で警告を出しつつ続行する", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tweets = makeTweets(50);
    const corpus = preprocess(tweets);

    expect(corpus.tweets.length).toBe(50);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("100件以上を推奨"),
    );
  });

  it("50,000件超で VALIDATION_ERROR を投げる", () => {
    const tweets = { length: 50_001 } as Tweet[];
    expect(() => preprocess(tweets)).toThrow(ValidationError);
    expect(() => preprocess(tweets)).toThrow("上限");
  });

  // --- カスタムフィルタ・ノーマライザ ---

  it("カスタムフィルタとノーマライザで処理できる", () => {
    const tweets = makeTweets(20);
    const customFilter = (t: Tweet) => t.text.includes("10");
    const customNormalizer = (text: string) => text.toUpperCase();

    const corpus = preprocess(tweets, [customFilter], [customNormalizer]);

    // "テスト投稿 10 です。" を含むツイートが除外される
    expect(corpus.tweets.length).toBeLessThan(20);
    // ノーマライザが適用されている
    expect(corpus.tweets[0].text).toMatch(/^テスト投稿/);
  });
});
