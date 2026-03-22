import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TweetId, Timestamp } from "@groa/types";
import type { Tweet } from "@groa/types";
import {
  getTokenizer,
  calcLengthDistribution,
  calcCharTypeRatio,
  extractPunctuation,
  extractSentenceEndings,
  extractTopTokens,
  extractNgrams,
  extractTopEmoji,
  calcHourlyDistribution,
  calcLineBreaks,
  calcSharingRate,
  calcReplyRate,
} from "./index.js";

function makeTweet(overrides: Partial<Tweet> & { text: string }): Tweet {
  return {
    id: TweetId(`t-${Math.random().toString(36).slice(2, 8)}`),
    timestamp: Timestamp(Date.now()),
    isRetweet: false,
    hasMedia: false,
    replyTo: null,
    ...overrides,
  };
}

describe("getTokenizer", () => {
  it("kuromoji.js トークナイザーを初期化できる", async () => {
    const tokenizer = await getTokenizer();
    expect(tokenizer).toBeDefined();
    expect(typeof tokenizer.tokenize).toBe("function");
  });

  it("日本語テキストをトークナイズできる", async () => {
    const tokenizer = await getTokenizer();
    const tokens = tokenizer.tokenize("今日はいい天気ですね");

    expect(tokens.length).toBeGreaterThan(0);
    // "今日" が名詞として解析されることを確認
    const kyou = tokens.find((t) => t.surface_form === "今日");
    expect(kyou).toBeDefined();
  });

  it("2回目以降はキャッシュから返す", async () => {
    const t1 = await getTokenizer();
    const t2 = await getTokenizer();
    expect(t1).toBe(t2);
  });
});

describe("calcLengthDistribution", () => {
  it("平均・中央値・標準偏差を正しく算出する", () => {
    const lengths = [10, 20, 30, 40, 50];
    const dist = calcLengthDistribution(lengths);

    expect(dist.mean).toBe(30);
    expect(dist.median).toBe(30);
    expect(dist.stdDev).toBeCloseTo(14.14, 1);
  });

  it("パーセンタイルを正しく算出する", () => {
    // 0-99 の連番（100件）
    const lengths = Array.from({ length: 100 }, (_, i) => i);
    const dist = calcLengthDistribution(lengths);

    expect(dist.percentiles.p10).toBeCloseTo(9.9, 0);
    expect(dist.percentiles.p25).toBeCloseTo(24.75, 0);
    expect(dist.percentiles.p75).toBeCloseTo(74.25, 0);
    expect(dist.percentiles.p90).toBeCloseTo(89.1, 0);
  });

  it("1件の場合は全て同じ値", () => {
    const dist = calcLengthDistribution([42]);

    expect(dist.mean).toBe(42);
    expect(dist.median).toBe(42);
    expect(dist.stdDev).toBe(0);
    expect(dist.percentiles.p25).toBe(42);
  });

  it("空配列では全て0", () => {
    const dist = calcLengthDistribution([]);

    expect(dist.mean).toBe(0);
    expect(dist.median).toBe(0);
    expect(dist.stdDev).toBe(0);
  });

  it("同一値の場合は標準偏差が0", () => {
    const dist = calcLengthDistribution([5, 5, 5, 5, 5]);

    expect(dist.mean).toBe(5);
    expect(dist.stdDev).toBe(0);
  });
});

describe("calcCharTypeRatio", () => {
  it("ひらがなのみのテキストでひらがな比率が1.0", () => {
    const ratio = calcCharTypeRatio(["あいうえお"]);

    expect(ratio.hiragana).toBeCloseTo(1.0, 2);
    expect(ratio.katakana).toBe(0);
    expect(ratio.kanji).toBe(0);
  });

  it("カタカナのみのテキストでカタカナ比率が1.0", () => {
    const ratio = calcCharTypeRatio(["アイウエオ"]);

    expect(ratio.katakana).toBeCloseTo(1.0, 2);
  });

  it("漢字のみのテキストで漢字比率が1.0", () => {
    const ratio = calcCharTypeRatio(["東京都"]);

    expect(ratio.kanji).toBeCloseTo(1.0, 2);
  });

  it("ASCIIのみのテキストでASCII比率が1.0", () => {
    const ratio = calcCharTypeRatio(["Hello World"]);

    // スペースもASCIIとしてカウントされる
    expect(ratio.ascii).toBeCloseTo(1.0, 2);
  });

  it("絵文字を検出する", () => {
    const ratio = calcCharTypeRatio(["😀🎉"]);

    expect(ratio.emoji).toBeGreaterThan(0);
  });

  it("混合テキストで各比率の合計が1.0以下", () => {
    const ratio = calcCharTypeRatio(["今日はReactの勉強をした😊"]);

    const total =
      ratio.hiragana +
      ratio.katakana +
      ratio.kanji +
      ratio.ascii +
      ratio.emoji;
    expect(total).toBeLessThanOrEqual(1.0);
    expect(total).toBeGreaterThan(0);
  });

  it("複数テキストを集約して計算する", () => {
    const ratio = calcCharTypeRatio(["あいう", "ABC"]);

    expect(ratio.hiragana).toBeCloseTo(0.5, 2);
    expect(ratio.ascii).toBeCloseTo(0.5, 2);
  });

  it("空テキスト配列では全て0", () => {
    const ratio = calcCharTypeRatio([]);

    expect(ratio.hiragana).toBe(0);
    expect(ratio.katakana).toBe(0);
    expect(ratio.kanji).toBe(0);
    expect(ratio.ascii).toBe(0);
    expect(ratio.emoji).toBe(0);
  });
});

describe("extractPunctuation", () => {
  it("文末の「。」を検出する", () => {
    const p = extractPunctuation(["今日はいい天気。", "明日も晴れ。"]);
    expect(p.sentenceEnders["。"]).toBe(2);
  });

  it("文末の「！」「？」を検出する", () => {
    const p = extractPunctuation(["すごい！", "本当？"]);
    expect(p.sentenceEnders["！"]).toBe(1);
    expect(p.sentenceEnders["？"]).toBe(1);
  });

  it("文末の「w」を検出する", () => {
    const p = extractPunctuation(["面白いw"]);
    expect(p.sentenceEnders["w"]).toBe(1);
  });

  it("文末が記号でない場合「なし」を返す", () => {
    const p = extractPunctuation(["今日はいい天気"]);
    expect(p.sentenceEnders["なし"]).toBe(1);
  });

  it("読点の種類をカウントする", () => {
    const p = extractPunctuation(["今日は、天気がいい、嬉しい"]);
    expect(p.commaStyle["、"]).toBe(2);
  });

  it("括弧の種類をカウントする", () => {
    const p = extractPunctuation(["「こんにちは」と言った（笑）"]);
    expect(p.bracketStyles["「"]).toBe(1);
    expect(p.bracketStyles["（"]).toBe(1);
  });
});

describe("extractSentenceEndings", () => {
  it("語尾パターンを抽出する", async () => {
    const tokenizer = await getTokenizer();

    const tweets = [
      { id: TweetId("t1"), text: "今日はいい天気ですね" },
      { id: TweetId("t2"), text: "明日も晴れるかな" },
      { id: TweetId("t3"), text: "暑いですね" },
      { id: TweetId("t4"), text: "本当にそう思います" },
    ];

    const tokenized = tweets.map(({ id, text }) => ({
      id,
      tokens: tokenizer.tokenize(text),
    }));

    const endings = extractSentenceEndings(tokenized);

    expect(endings.length).toBeGreaterThan(0);
    // 各パターンにfrequencyとexampleTweetIdsが存在する
    for (const e of endings) {
      expect(e.frequency).toBeGreaterThan(0);
      expect(e.exampleTweetIds.length).toBeGreaterThan(0);
      expect(e.exampleTweetIds.length).toBeLessThanOrEqual(3);
    }
  });

  it("頻度順にソートされる", async () => {
    const tokenizer = await getTokenizer();

    const tweets = Array.from({ length: 10 }, (_, i) => ({
      id: TweetId(`t${i}`),
      text: i < 7 ? "今日はいい天気ですね" : "明日は雨かな",
    }));

    const tokenized = tweets.map(({ id, text }) => ({
      id,
      tokens: tokenizer.tokenize(text),
    }));

    const endings = extractSentenceEndings(tokenized);

    // 最初のパターンが最も頻度が高い
    for (let i = 1; i < endings.length; i++) {
      expect(endings[i - 1].frequency).toBeGreaterThanOrEqual(
        endings[i].frequency,
      );
    }
  });

  it("上位20件に制限される", async () => {
    const tokenizer = await getTokenizer();

    // 30種類以上の異なる語尾を持つツイート
    const suffixes = [
      "です", "ます", "だよ", "かな", "ですね", "ました",
      "でしょう", "だろう", "ないかな", "だった", "そうだ",
      "みたい", "らしい", "っぽい", "だけど", "ですが",
      "でした", "たい", "たくない", "べきだ", "はずだ",
      "かもしれない", "にちがいない", "ところだ", "わけだ",
    ];

    const tweets = suffixes.map((s, i) => ({
      id: TweetId(`t${i}`),
      text: `今日は天気が良い${s}`,
    }));

    const tokenized = tweets.map(({ id, text }) => ({
      id,
      tokens: tokenizer.tokenize(text),
    }));

    const endings = extractSentenceEndings(tokenized);
    expect(endings.length).toBeLessThanOrEqual(20);
  });

  it("実例ツイートIDが最大3件紐づけられる", async () => {
    const tokenizer = await getTokenizer();

    const tweets = Array.from({ length: 10 }, (_, i) => ({
      id: TweetId(`t${i}`),
      text: "今日はいい天気ですね",
    }));

    const tokenized = tweets.map(({ id, text }) => ({
      id,
      tokens: tokenizer.tokenize(text),
    }));

    const endings = extractSentenceEndings(tokenized);
    expect(endings[0].exampleTweetIds.length).toBe(3);
  });
});

describe("extractTopTokens", () => {
  it("頻出語彙を抽出する（ストップワード除外）", async () => {
    const tokenizer = await getTokenizer();
    const texts = [
      "今日は天気がいい",
      "明日も天気がいい",
      "天気予報を見た",
    ];
    const tokenized = texts.map((t) => tokenizer.tokenize(t));
    const tokens = extractTopTokens(tokenized);

    expect(tokens.length).toBeGreaterThan(0);
    // "天気" が最頻出のはず
    expect(tokens[0].token).toBe("天気");
    expect(tokens[0].count).toBe(3);
  });

  it("名詞フラグが正しく付与される", async () => {
    const tokenizer = await getTokenizer();
    const tokenized = [tokenizer.tokenize("東京タワーは素晴らしい")];
    const tokens = extractTopTokens(tokenized);

    const noun = tokens.find((t) => t.token === "東京");
    if (noun) {
      expect(noun.isNoun).toBe(true);
    }
  });

  it("上位50件に制限される", async () => {
    const tokenizer = await getTokenizer();
    const text =
      "月曜日、火曜日、水曜日、木曜日、金曜日、土曜日、日曜日に " +
      "朝食、昼食、夕食、おやつ、デザート、飲み物を食べた";
    const tokenized = Array.from({ length: 50 }, () =>
      tokenizer.tokenize(text),
    );
    const tokens = extractTopTokens(tokenized);

    expect(tokens.length).toBeLessThanOrEqual(50);
  });
});

describe("extractNgrams", () => {
  it("2-gram/3-gram を抽出する", async () => {
    const tokenizer = await getTokenizer();
    const texts = ["今日はいい天気", "今日はいい天気", "今日はいい天気"];
    const tokenized = texts.map((t) => tokenizer.tokenize(t));
    const ngrams = extractNgrams(tokenized);

    expect(ngrams.bigrams.length).toBeGreaterThan(0);
    expect(ngrams.trigrams.length).toBeGreaterThan(0);
    // 最頻のbigramは3回出現するはず
    expect(ngrams.bigrams[0].count).toBe(3);
  });

  it("各上位20件に制限される", async () => {
    const tokenizer = await getTokenizer();
    const tokenized = [tokenizer.tokenize("あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほ")];
    const ngrams = extractNgrams(tokenized);

    expect(ngrams.bigrams.length).toBeLessThanOrEqual(20);
    expect(ngrams.trigrams.length).toBeLessThanOrEqual(20);
  });
});

describe("extractTopEmoji", () => {
  it("絵文字上位10件を抽出する", () => {
    const emoji = extractTopEmoji(["😀😀😀🎉🎉❤️"]);

    expect(emoji.length).toBeGreaterThan(0);
    expect(emoji[0].emoji).toBe("😀");
    expect(emoji[0].count).toBe(3);
  });

  it("絵文字なしの場合は空配列", () => {
    const emoji = extractTopEmoji(["テキストのみ"]);
    expect(emoji).toHaveLength(0);
  });

  it("上位10件に制限される", () => {
    const text = "😀😁😂🤣😃😄😅😆😉😊😋😎😍🥰😘";
    const emoji = extractTopEmoji([text]);
    expect(emoji.length).toBeLessThanOrEqual(10);
  });
});

describe("calcHourlyDistribution", () => {
  it("24要素の配列を返す", () => {
    const dist = calcHourlyDistribution([]);
    expect(dist).toHaveLength(24);
  });

  it("投稿時刻を正しく集計する", () => {
    // 午前9時のタイムスタンプを3つ
    const baseDate = new Date("2025-10-01T09:00:00");
    const timestamps = [
      baseDate.getTime(),
      baseDate.getTime() + 1000,
      baseDate.getTime() + 2000,
    ];
    const dist = calcHourlyDistribution(timestamps);

    expect(dist[9]).toBe(3);
    expect(dist[0]).toBe(0);
  });
});

describe("calcLineBreaks", () => {
  it("改行を含むツイートの数と平均改行数を算出する", () => {
    const lb = calcLineBreaks(["行1\n行2\n行3", "改行なし", "行1\n行2"]);

    expect(lb.tweetsWithBreaks).toBe(2);
    expect(lb.avgBreaksPerTweet).toBeCloseTo(1.0, 1);
  });

  it("空配列では0を返す", () => {
    const lb = calcLineBreaks([]);
    expect(lb.tweetsWithBreaks).toBe(0);
    expect(lb.avgBreaksPerTweet).toBe(0);
  });
});

describe("calcSharingRate", () => {
  it("URL含有率とメディア含有率を算出する", () => {
    const tweets = [
      makeTweet({ text: "[URL] を見て", hasMedia: true }),
      makeTweet({ text: "普通のツイート" }),
      makeTweet({ text: "[URL] 面白い", hasMedia: false }),
    ];

    const rate = calcSharingRate(tweets);
    expect(rate.urlRate).toBeCloseTo(2 / 3, 2);
    expect(rate.mediaRate).toBeCloseTo(1 / 3, 2);
  });
});

describe("calcReplyRate", () => {
  it("リプライ率を算出する", () => {
    const tweets = [
      makeTweet({ text: "a", replyTo: TweetId("r1") }),
      makeTweet({ text: "b", replyTo: null }),
      makeTweet({ text: "c", replyTo: null }),
      makeTweet({ text: "d", replyTo: TweetId("r2") }),
    ];

    expect(calcReplyRate(tweets)).toBeCloseTo(0.5, 2);
  });

  it("空配列では0を返す", () => {
    expect(calcReplyRate([])).toBe(0);
  });
});

// --- 合成データセット ---

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "..", "..", "test", "fixtures");

interface RawTweet {
  id: string;
  text: string;
  timestamp: number;
  isRetweet: boolean;
  hasMedia: boolean;
  replyTo: string | null;
}

function loadSyntheticTweets(): Tweet[] {
  const raw = readFileSync(
    join(FIXTURES_DIR, "synthetic-tweets.json"),
    "utf-8",
  );
  const data = JSON.parse(raw) as RawTweet[];
  return data.map((t) => ({
    id: TweetId(t.id),
    text: t.text,
    timestamp: Timestamp(t.timestamp),
    isRetweet: t.isRetweet,
    hasMedia: t.hasMedia,
    replyTo: t.replyTo != null ? TweetId(t.replyTo) : null,
  }));
}

describe("合成データセット", () => {
  it("100件のツイートで文字数分布を算出できる", () => {
    const tweets = loadSyntheticTweets();
    const lengths = tweets.map((t) => t.text.length);
    const dist = calcLengthDistribution(lengths);

    expect(dist.mean).toBeGreaterThan(0);
    expect(dist.median).toBeGreaterThan(0);
    expect(dist.stdDev).toBeGreaterThanOrEqual(0);
  });

  it("100件のツイートで文字種比率を算出できる", () => {
    const tweets = loadSyntheticTweets();
    const texts = tweets.map((t) => t.text);
    const ratio = calcCharTypeRatio(texts);

    expect(ratio.hiragana).toBeGreaterThan(0);
    expect(ratio.katakana).toBeGreaterThanOrEqual(0);
    expect(ratio.kanji).toBeGreaterThan(0);
    const total =
      ratio.hiragana + ratio.katakana + ratio.kanji + ratio.ascii + ratio.emoji;
    expect(total).toBeLessThanOrEqual(1.01);
  });

  it("100件のツイートで句読点パターンを抽出できる", () => {
    const tweets = loadSyntheticTweets();
    const texts = tweets.map((t) => t.text);
    const punct = extractPunctuation(texts);

    expect(punct.sentenceEnders).toBeDefined();
    const totalEnders = Object.values(punct.sentenceEnders).reduce(
      (sum: number, v: number) => sum + v,
      0,
    );
    expect(totalEnders).toBeGreaterThan(0);
  });

  it("100件のツイートで時間帯分布を算出できる", () => {
    const tweets = loadSyntheticTweets();
    const timestamps = tweets.map((t) => t.timestamp as number);
    const dist = calcHourlyDistribution(timestamps);

    expect(dist).toHaveLength(24);
    const total = dist.reduce((sum, v) => sum + v, 0);
    expect(total).toBe(100);
  });

  it("100件のツイートでリプライ率を算出できる", () => {
    const tweets = loadSyntheticTweets();
    const rate = calcReplyRate(tweets);

    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });

  it("100件のツイートでURL/メディア共有率を算出できる", () => {
    const tweets = loadSyntheticTweets();
    const rate = calcSharingRate(tweets);

    expect(rate.urlRate).toBeGreaterThanOrEqual(0);
    expect(rate.urlRate).toBeLessThanOrEqual(1);
    expect(rate.mediaRate).toBeGreaterThanOrEqual(0);
    expect(rate.mediaRate).toBeLessThanOrEqual(1);
  });
});
