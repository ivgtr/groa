import { describe, it, expect } from "vitest";
import { TweetId, Timestamp } from "@groa/types";
import { TweetSchema } from "@groa/types";
import {
  convertTweets,
  buildDefinition,
  detectFormat,
} from "./convert.js";
import { TWINT_DEFINITION } from "./converters/twint.js";
import { TWITTER_ARCHIVE_DEFINITION } from "./converters/twitter-archive.js";
import { parseTweetsJs } from "./parse-tweets-js.js";
import {
  toTweetId,
  toTimestamp,
  toBoolean,
  toHasMedia,
  toNullableTweetId,
  toText,
} from "./field-transformers.js";
import { ConversionError } from "./errors.js";

// =============================================================================
// field-transformers
// =============================================================================

describe("toTweetId", () => {
  it("文字列をそのまま TweetId に変換する", () => {
    expect(toTweetId("tweet-001")).toBe("tweet-001");
  });

  it("数値を文字列化して TweetId に変換する", () => {
    expect(toTweetId(12345)).toBe("12345");
  });

  it("MAX_SAFE_INTEGER を超える数値は精度が失われる（JSON.parse の制限）", () => {
    // 1318915034345451520 は Number.MAX_SAFE_INTEGER を超えるため、
    // JavaScript では 1318915034345451500 に丸められる。
    // これは JSON.parse の時点で発生する既知の制限。
    const largeId = 1318915034345451520;
    expect(toTweetId(largeId)).toBe(String(largeId));
  });

  it("空文字はエラー", () => {
    expect(() => toTweetId("")).toThrow(ConversionError);
  });

  it("null はエラー", () => {
    expect(() => toTweetId(null)).toThrow(ConversionError);
  });
});

describe("toTimestamp", () => {
  it("ミリ秒の数値をそのまま返す", () => {
    const ms = 1603288823000;
    expect(toTimestamp(ms)).toBe(ms);
  });

  it("秒の数値をミリ秒に変換する", () => {
    const sec = 1603288823;
    expect(toTimestamp(sec)).toBe(sec * 1000);
  });

  it("JST付き日時文字列をパースする", () => {
    // "2020-10-21 23:00:23 JST" = 2020-10-21T14:00:23Z
    const result = toTimestamp("2020-10-21 23:00:23 JST");
    const expected = Date.UTC(2020, 9, 21, 14, 0, 23);
    expect(result).toBe(expected);
  });

  it("UTC付き日時文字列をパースする", () => {
    const result = toTimestamp("2020-10-21 14:00:23 UTC");
    const expected = Date.UTC(2020, 9, 21, 14, 0, 23);
    expect(result).toBe(expected);
  });

  it("PST付き日時文字列をパースする", () => {
    // PST = UTC-8, "2020-10-21 06:00:23 PST" = 2020-10-21T14:00:23Z
    const result = toTimestamp("2020-10-21 06:00:23 PST");
    const expected = Date.UTC(2020, 9, 21, 14, 0, 23);
    expect(result).toBe(expected);
  });

  it("タイムゾーンなし日時文字列をUTCとしてパースする", () => {
    const result = toTimestamp("2020-10-21 14:00:23");
    const expected = Date.UTC(2020, 9, 21, 14, 0, 23);
    expect(result).toBe(expected);
  });

  it("RFC 2822風の文字列をパースする（UTC）", () => {
    const result = toTimestamp("Wed Oct 21 14:00:23 +0000 2020");
    const expected = Date.UTC(2020, 9, 21, 14, 0, 23);
    expect(result).toBe(expected);
  });

  it("RFC 2822風の文字列をパースする（+0900）", () => {
    // "Wed Oct 21 23:00:23 +0900 2020" = 2020-10-21T14:00:23Z
    const result = toTimestamp("Wed Oct 21 23:00:23 +0900 2020");
    const expected = Date.UTC(2020, 9, 21, 14, 0, 23);
    expect(result).toBe(expected);
  });

  it("RFC 2822風の文字列をパースする（-0530）", () => {
    // "Wed Oct 21 08:30:23 -0530 2020" = 2020-10-21T14:00:23Z
    const result = toTimestamp("Wed Oct 21 08:30:23 -0530 2020");
    const expected = Date.UTC(2020, 9, 21, 14, 0, 23);
    expect(result).toBe(expected);
  });

  it("ISO 8601文字列をパースする", () => {
    const result = toTimestamp("2020-10-21T14:00:23.000Z");
    const expected = Date.UTC(2020, 9, 21, 14, 0, 23);
    expect(result).toBe(expected);
  });

  it("未対応のタイムゾーンはエラー", () => {
    expect(() => toTimestamp("2020-10-21 14:00:23 XYZ")).toThrow(ConversionError);
  });

  it("空文字はエラー", () => {
    expect(() => toTimestamp("")).toThrow(ConversionError);
  });

  it("null はエラー", () => {
    expect(() => toTimestamp(null)).toThrow(ConversionError);
  });
});

describe("toBoolean", () => {
  it("true → true", () => expect(toBoolean(true)).toBe(true));
  it("false → false", () => expect(toBoolean(false)).toBe(false));
  it("1 → true", () => expect(toBoolean(1)).toBe(true));
  it("0 → false", () => expect(toBoolean(0)).toBe(false));
  it('"true" → true', () => expect(toBoolean("true")).toBe(true));
  it('"false" → false', () => expect(toBoolean("false")).toBe(false));
  it('"" → false', () => expect(toBoolean("")).toBe(false));
});

describe("toHasMedia", () => {
  it("非空配列 → true", () => expect(toHasMedia(["photo.jpg"])).toBe(true));
  it("空配列 → false", () => expect(toHasMedia([])).toBe(false));
  it("0 → false", () => expect(toHasMedia(0)).toBe(false));
  it("1 → true", () => expect(toHasMedia(1)).toBe(true));
  it("true → true", () => expect(toHasMedia(true)).toBe(true));
  it("false → false", () => expect(toHasMedia(false)).toBe(false));
  it("null → false", () => expect(toHasMedia(null)).toBe(false));
});

describe("toNullableTweetId", () => {
  it("文字列 → TweetId", () => {
    expect(toNullableTweetId("123")).toBe("123");
  });
  it("null → null", () => expect(toNullableTweetId(null)).toBeNull());
  it("undefined → null", () => expect(toNullableTweetId(undefined)).toBeNull());
  it('空文字 → null', () => expect(toNullableTweetId("")).toBeNull());
  it('"null" → null', () => expect(toNullableTweetId("null")).toBeNull());
  it("0 → null", () => expect(toNullableTweetId(0)).toBeNull());
  it("数値 → TweetId", () => expect(toNullableTweetId(12345)).toBe("12345"));
});

describe("toText", () => {
  it("文字列をそのまま返す", () => {
    expect(toText("hello")).toBe("hello");
  });
  it("空文字はエラー", () => {
    expect(() => toText("")).toThrow(ConversionError);
  });
  it("null はエラー", () => {
    expect(() => toText(null)).toThrow(ConversionError);
  });
});

// =============================================================================
// TWINT_DEFINITION
// =============================================================================

describe("TWINT_DEFINITION", () => {
  const TWINT_SAMPLE = {
    id: 1318915034345451520,
    conversation_id: "1318915034345451520",
    created_at: "2020-10-21 23:00:23 JST",
    date: "2020-10-21",
    time: "23:00:23",
    timezone: "+0900",
    user_id: 1085498064645705728,
    username: "yuzuki_roa",
    name: "夢月ロア🌖24時以降配信",
    place: "",
    tweet:
      "自分にとってはファンの人がとても大切で本当に本当に宝物みたいに思っていました。",
    language: "ja",
    mentions: [],
    urls: [],
    photos: [],
    replies_count: 1814,
    retweets_count: 6747,
    likes_count: 26788,
    hashtags: [],
    cashtags: [],
    link: "https://twitter.com/yuzuki_roa/status/1318915034345451520",
    retweet: false,
    quote_url: "",
    video: 0,
    thumbnail: "",
    near: "",
    geo: "",
    source: "",
    user_rt_id: "",
    user_rt: "",
    retweet_id: "",
    reply_to: [] as unknown[],
    retweet_date: "",
    translate: "",
    trans_src: "",
    trans_dest: "",
  };

  const TWINT_REPLY_SAMPLE = {
    ...TWINT_SAMPLE,
    id: 1317787083759517697,
    conversation_id: "1317768711508389890",
    tweet: "@honmahimawari 久しぶりにお世話になったけど、いい奴すぎたのだ😢",
    reply_to: [
      {
        screen_name: "honmahimawari",
        name: "本間ひまわり🌻おやちみ",
        id: "1011167857596493824",
      },
    ],
  };

  const TWINT_MEDIA_SAMPLE = {
    ...TWINT_SAMPLE,
    id: 1318912752413364224,
    photos: [
      "https://pbs.twimg.com/media/Ek24J_4VkAAgYrg.jpg",
      "https://pbs.twimg.com/media/Ek24J_3UUAA03cO.jpg",
    ],
    video: 1,
  };

  it("通常ツイートを正しく変換する", () => {
    const result = convertTweets([TWINT_SAMPLE], TWINT_DEFINITION);

    expect(result.convertedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.tweets).toHaveLength(1);

    const tweet = result.tweets[0];
    // id は number で JSON.parse 時に精度が失われるため、String() の結果で比較
    expect(tweet.id).toBe(String(1318915034345451520));
    expect(tweet.text).toBe(
      "自分にとってはファンの人がとても大切で本当に本当に宝物みたいに思っていました。",
    );
    expect(tweet.timestamp).toBe(Date.UTC(2020, 9, 21, 14, 0, 23));
    expect(tweet.isRetweet).toBe(false);
    expect(tweet.hasMedia).toBe(false);
    expect(tweet.replyTo).toBeNull();
  });

  it("リプライツイートの replyTo を正しく導出する", () => {
    const result = convertTweets([TWINT_REPLY_SAMPLE], TWINT_DEFINITION);

    expect(result.tweets).toHaveLength(1);
    expect(result.tweets[0].replyTo).toBe("1317768711508389890");
  });

  it("メディア付きツイートの hasMedia を正しく導出する", () => {
    const result = convertTweets([TWINT_MEDIA_SAMPLE], TWINT_DEFINITION);

    expect(result.tweets).toHaveLength(1);
    expect(result.tweets[0].hasMedia).toBe(true);
  });

  it("変換結果が TweetSchema を通過する", () => {
    const result = convertTweets([TWINT_SAMPLE], TWINT_DEFINITION);

    for (const tweet of result.tweets) {
      const parsed = TweetSchema.safeParse(tweet);
      expect(parsed.success).toBe(true);
    }
  });

  it("複数件を一括変換する", () => {
    const items = [
      TWINT_SAMPLE,
      TWINT_REPLY_SAMPLE,
      TWINT_MEDIA_SAMPLE,
    ];
    const result = convertTweets(items, TWINT_DEFINITION);

    expect(result.totalCount).toBe(3);
    expect(result.convertedCount).toBe(3);
    expect(result.skippedCount).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// =============================================================================
// convertTweets
// =============================================================================

describe("convertTweets", () => {
  it("不正なレコードをスキップして warnings に記録する", () => {
    const definition = buildDefinition({});
    const data = [
      { id: "1", text: "hello", timestamp: 1600000000000, isRetweet: false, hasMedia: false, replyTo: null },
      "not an object",
      null,
      { id: "2", text: "world", timestamp: 1600000000000, isRetweet: false, hasMedia: false, replyTo: null },
    ];
    const result = convertTweets(data as unknown[], definition);

    expect(result.convertedCount).toBe(2);
    expect(result.skippedCount).toBe(2);
    expect(result.warnings).toHaveLength(2);
  });

  it("全件失敗でエラーをスローする", () => {
    const definition = buildDefinition({ text: "nonexistent_key" });
    const data = [{ id: "1" }];
    expect(() => convertTweets(data, definition)).toThrow(ConversionError);
  });

  it("空配列で空の結果を返す", () => {
    const definition = buildDefinition({});
    const result = convertTweets([], definition);

    expect(result.tweets).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(result.convertedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
  });
});

// =============================================================================
// buildDefinition
// =============================================================================

describe("buildDefinition", () => {
  it("デフォルトキー名で ConverterDefinition を構築する", () => {
    const def = buildDefinition({});

    expect(def.id.sourceKey).toBe("id");
    expect(def.text.sourceKey).toBe("text");
    expect(def.timestamp.sourceKey).toBe("timestamp");
    expect(def.isRetweet.sourceKey).toBe("isRetweet");
    expect(def.hasMedia.sourceKey).toBe("hasMedia");
    expect(def.replyTo.sourceKey).toBe("replyTo");
  });

  it("カスタムキー名で ConverterDefinition を構築する", () => {
    const def = buildDefinition({
      id: "tweet_id",
      text: "body",
      timestamp: "posted_at",
    });

    expect(def.id.sourceKey).toBe("tweet_id");
    expect(def.text.sourceKey).toBe("body");
    expect(def.timestamp.sourceKey).toBe("posted_at");
    // 未指定フィールドはデフォルト
    expect(def.isRetweet.sourceKey).toBe("isRetweet");
  });

  it("構築した定義でデータを変換できる", () => {
    const def = buildDefinition({
      id: "tweet_id",
      text: "body",
      timestamp: "ts",
    });
    const data = [
      {
        tweet_id: "123",
        body: "テスト",
        ts: 1600000000000,
        isRetweet: false,
        hasMedia: false,
        replyTo: null,
      },
    ];
    const result = convertTweets(data, def);

    expect(result.convertedCount).toBe(1);
    expect(result.tweets[0].id).toBe("123");
    expect(result.tweets[0].text).toBe("テスト");
  });
});

// =============================================================================
// detectFormat
// =============================================================================

describe("detectFormat", () => {
  it("groa ネイティブ形式を検出する", () => {
    const data = [
      {
        id: "tweet-001",
        text: "テスト",
        timestamp: 1600000000000,
        isRetweet: false,
        hasMedia: false,
        replyTo: null,
      },
    ];
    const result = detectFormat(data);

    expect(result.isNativeGroa).toBe(true);
    expect(result.formatName).toBeNull();
  });

  it("Twint 形式を検出する", () => {
    const data = [
      {
        id: 123,
        tweet: "テスト",
        created_at: "2020-10-21 23:00:23 JST",
        retweet: false,
        username: "test_user",
        photos: [],
        video: 0,
      },
    ];
    const result = detectFormat(data);

    expect(result.isNativeGroa).toBe(false);
    expect(result.formatName).toBe("twint");
  });

  it("未知のフォーマットで formatName が null", () => {
    const data = [{ foo: "bar", baz: 123 }];
    const result = detectFormat(data);

    expect(result.isNativeGroa).toBe(false);
    expect(result.formatName).toBeNull();
    expect(result.detectedKeys).toEqual(["foo", "baz"]);
  });

  it("空配列で安全に動作する", () => {
    const result = detectFormat([]);

    expect(result.isNativeGroa).toBe(false);
    expect(result.formatName).toBeNull();
    expect(result.detectedKeys).toEqual([]);
  });

  it("Twitter/X アーカイブ形式を検出する", () => {
    const data = [
      {
        id_str: "1318915034345451520",
        full_text: "テスト",
        created_at: "Wed Oct 21 14:00:23 +0000 2020",
        entities: { hashtags: [], urls: [] },
        retweeted: false,
        lang: "ja",
      },
    ];
    const result = detectFormat(data);

    expect(result.isNativeGroa).toBe(false);
    expect(result.formatName).toBe("twitter-archive");
  });
});

// =============================================================================
// TWITTER_ARCHIVE_DEFINITION
// =============================================================================

describe("TWITTER_ARCHIVE_DEFINITION", () => {
  const ARCHIVE_SAMPLE = {
    id_str: "1318915034345451520",
    full_text:
      "自分にとってはファンの人がとても大切で本当に本当に宝物みたいに思っていました。",
    created_at: "Wed Oct 21 14:00:23 +0000 2020",
    retweeted: false,
    entities: {
      hashtags: [],
      urls: [],
      user_mentions: [],
    },
    in_reply_to_status_id_str: null,
    lang: "ja",
    display_text_range: [0, 42],
    favorite_count: "26788",
    retweet_count: "6747",
  };

  const ARCHIVE_RT_SAMPLE = {
    ...ARCHIVE_SAMPLE,
    id_str: "1317787083759517697",
    full_text:
      "RT @honmahimawari: これはリツイートされたツイートです。",
    retweeted: false,
  };

  const ARCHIVE_MEDIA_SAMPLE = {
    ...ARCHIVE_SAMPLE,
    id_str: "1318912752413364224",
    entities: {
      hashtags: [],
      urls: [],
      user_mentions: [],
      media: [
        {
          media_url: "https://pbs.twimg.com/media/Ek24J_4VkAAgYrg.jpg",
          type: "photo",
        },
      ],
    },
  };

  const ARCHIVE_REPLY_SAMPLE = {
    ...ARCHIVE_SAMPLE,
    id_str: "1317787083759517698",
    full_text: "@honmahimawari 久しぶり！",
    in_reply_to_status_id_str: "1317768711508389890",
  };

  it("通常ツイートを正しく変換する", () => {
    const result = convertTweets([ARCHIVE_SAMPLE], TWITTER_ARCHIVE_DEFINITION);

    expect(result.convertedCount).toBe(1);
    expect(result.skippedCount).toBe(0);

    const tweet = result.tweets[0];
    expect(tweet.id).toBe("1318915034345451520");
    expect(tweet.text).toBe(
      "自分にとってはファンの人がとても大切で本当に本当に宝物みたいに思っていました。",
    );
    expect(tweet.timestamp).toBe(Date.UTC(2020, 9, 21, 14, 0, 23));
    expect(tweet.isRetweet).toBe(false);
    expect(tweet.hasMedia).toBe(false);
    expect(tweet.replyTo).toBeNull();
  });

  it("リツイートを full_text の 'RT @' 前置で判定する", () => {
    const result = convertTweets(
      [ARCHIVE_RT_SAMPLE],
      TWITTER_ARCHIVE_DEFINITION,
    );

    expect(result.tweets).toHaveLength(1);
    expect(result.tweets[0].isRetweet).toBe(true);
  });

  it("メディア付きツイートの hasMedia を entities.media で判定する", () => {
    const result = convertTweets(
      [ARCHIVE_MEDIA_SAMPLE],
      TWITTER_ARCHIVE_DEFINITION,
    );

    expect(result.tweets).toHaveLength(1);
    expect(result.tweets[0].hasMedia).toBe(true);
  });

  it("リプライツイートの replyTo を in_reply_to_status_id_str で取得する", () => {
    const result = convertTweets(
      [ARCHIVE_REPLY_SAMPLE],
      TWITTER_ARCHIVE_DEFINITION,
    );

    expect(result.tweets).toHaveLength(1);
    expect(result.tweets[0].replyTo).toBe("1317768711508389890");
  });

  it("変換結果が TweetSchema を通過する", () => {
    const result = convertTweets(
      [ARCHIVE_SAMPLE, ARCHIVE_RT_SAMPLE, ARCHIVE_MEDIA_SAMPLE, ARCHIVE_REPLY_SAMPLE],
      TWITTER_ARCHIVE_DEFINITION,
    );

    expect(result.convertedCount).toBe(4);
    for (const tweet of result.tweets) {
      const parsed = TweetSchema.safeParse(tweet);
      expect(parsed.success).toBe(true);
    }
  });
});

// =============================================================================
// parseTweetsJs
// =============================================================================

describe("parseTweetsJs", () => {
  it("window.YTD.tweets.part0 プレフィックスを除去してパースする", () => {
    const js = `window.YTD.tweets.part0 = [{"tweet":{"id_str":"1","full_text":"hello"}}]`;
    const result = parseTweetsJs(js);

    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>).id_str).toBe("1");
    expect((result[0] as Record<string, unknown>).full_text).toBe("hello");
  });

  it("{ tweet: { ... } } ネストをアンラップする", () => {
    const js = `window.YTD.tweets.part0 = [{"tweet":{"id_str":"1","full_text":"hello"}},{"tweet":{"id_str":"2","full_text":"world"}}]`;
    const result = parseTweetsJs(js);

    expect(result).toHaveLength(2);
    expect((result[0] as Record<string, unknown>).id_str).toBe("1");
    expect((result[1] as Record<string, unknown>).id_str).toBe("2");
  });

  it("part1 等の異なるパート番号に対応する", () => {
    const js = `window.YTD.tweets.part1 = [{"tweet":{"id_str":"1","full_text":"hello"}}]`;
    const result = parseTweetsJs(js);

    expect(result).toHaveLength(1);
  });

  it("ネストされていない要素はそのまま返す", () => {
    const js = `window.YTD.tweets.part0 = [{"id_str":"1","full_text":"hello"}]`;
    const result = parseTweetsJs(js);

    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>).id_str).toBe("1");
  });

  it("UTF-8 BOM 付きファイルを正しくパースする", () => {
    const js = `\uFEFFwindow.YTD.tweets.part0 = [{"tweet":{"id_str":"1","full_text":"hello"}}]`;
    const result = parseTweetsJs(js);

    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>).id_str).toBe("1");
  });

  it("不正なJSファイルでエラーをスローする", () => {
    expect(() => parseTweetsJs("invalid content")).toThrow(ConversionError);
  });

  it("配列でない内容でエラーをスローする", () => {
    expect(() => parseTweetsJs(`window.YTD.tweets.part0 = {"not":"array"}`)).toThrow(
      ConversionError,
    );
  });
});
