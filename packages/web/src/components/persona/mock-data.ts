import type { PersonaDocument, StyleStats } from "@groa/types";
import { TweetId, Timestamp } from "@groa/types";

export const MOCK_PERSONA: PersonaDocument = {
  version: "1.0.0",
  createdAt: Timestamp(Date.now()),
  body: `# ペルソナ概要

この人物は技術に強い関心を持ちながら、日常の些細な出来事にも独自の視点で言及する傾向がある。

## 特徴

- **技術への深い関心**: プログラミングやツールに関する言及が多く、特にTypeScript・Rust関連の話題で活発
- **日常観察力**: 街で見かけた風景や食事に対して詩的な表現を用いる
- **批評的思考**: 社会的なトピックに対して中立的かつ分析的な立場を取る

## コミュニケーションスタイル

短文で端的に表現することを好み、句読点の使い方に独特のリズムがある。
絵文字の使用は控えめだが、感情的な場面では効果的に用いる。

> 「技術は手段であって目的ではない」という信念が根底にある。
`,
  voiceBank: [
    {
      tweet: {
        tweet: {
          id: TweetId("tw_001"),
          text: "TypeScriptの型システム、使いこなすと本当に生産性が変わる。型パズルにハマりすぎないのが大事だけど。",
          timestamp: Timestamp(1700000000000),
          isRetweet: false,
          hasMedia: false,
          replyTo: null,
        },
        category: "tech",
        sentiment: "positive",
        topics: ["TypeScript", "型システム", "生産性"],
      },
      selectionReason:
        "技術への肯定的態度と実用主義的バランス感覚が顕著に表れている代表的ツイート",
    },
    {
      tweet: {
        tweet: {
          id: TweetId("tw_002"),
          text: "朝の散歩で見つけた猫、目が合った瞬間に逃げられた。いつものこと。",
          timestamp: Timestamp(1700100000000),
          isRetweet: false,
          hasMedia: false,
          replyTo: null,
        },
        category: "daily",
        sentiment: "neutral",
        topics: ["散歩", "猫", "日常"],
      },
      selectionReason:
        "日常の小さなエピソードを淡々と描写するスタイルの典型例。短文で余韻を残す表現。",
    },
    {
      tweet: {
        tweet: {
          id: TweetId("tw_003"),
          text: "「効率化」って言葉、本当に効率的なことに使われてるケースが少ない気がする。",
          timestamp: Timestamp(1700200000000),
          isRetweet: false,
          hasMedia: false,
          replyTo: null,
        },
        category: "opinion",
        sentiment: "mixed",
        topics: ["効率化", "言葉", "疑問"],
      },
      selectionReason:
        "皮肉を含んだ批評的視点が表れている。抽象的な概念への問いかけ形式が特徴的。",
    },
  ],
  attitudePatterns: [
    {
      name: "実用主義的技術観",
      description:
        "技術を目的ではなく手段として捉え、実用性と生産性を重視する態度。新技術への関心は高いが盲目的な追従はしない。",
      exampleTweetIds: [TweetId("tw_001")],
      sourceCategories: ["tech"],
    },
    {
      name: "観察者としての日常描写",
      description:
        "日常の出来事を第三者的な視点で淡々と描写する。感情的な評価を控え、事実と印象を短く記述する。",
      exampleTweetIds: [TweetId("tw_002")],
      sourceCategories: ["daily"],
    },
    {
      name: "言葉への敏感さ",
      description:
        "言葉の使われ方や意味のズレに対して鋭い感覚を持つ。皮肉や逆説的表現を好む。",
      exampleTweetIds: [TweetId("tw_003")],
      sourceCategories: ["opinion", "creative"],
    },
  ],
  contradictions: [
    "効率を重視すると発言しつつ、非効率な趣味（手書きメモ）に時間を割いている",
    "SNSへの依存を批判しながら、投稿頻度が高い",
    "新技術への慎重姿勢と、新しいツールをすぐ試す行動の矛盾",
  ],
  sourceStats: {
    totalCount: 3200,
    dateRange: {
      start: Timestamp(1672531200000),
      end: Timestamp(1703980800000),
    },
    filteredCount: 2847,
  },
};

export const MOCK_STYLE_STATS: StyleStats = {
  lengthDistribution: {
    mean: 78.4,
    median: 65,
    stdDev: 42.1,
    percentiles: {
      p10: 23,
      p25: 42,
      p75: 105,
      p90: 138,
    },
  },
  punctuation: {
    sentenceEnders: { "。": 420, "！": 85, "？": 62, "…": 35 },
    commaStyle: { "、": 310, ",": 12 },
    bracketStyles: { "「」": 98, "（）": 23, "【】": 5 },
  },
  sentenceEndings: [
    {
      ending: "〜する",
      frequency: 0.18,
      exampleTweetIds: [TweetId("tw_001")],
    },
    {
      ending: "〜だけど",
      frequency: 0.12,
      exampleTweetIds: [TweetId("tw_001")],
    },
    {
      ending: "〜かな",
      frequency: 0.09,
      exampleTweetIds: [TweetId("tw_003")],
    },
    {
      ending: "〜気がする",
      frequency: 0.08,
      exampleTweetIds: [TweetId("tw_003")],
    },
    {
      ending: "〜のこと",
      frequency: 0.06,
      exampleTweetIds: [TweetId("tw_002")],
    },
  ],
  charTypeRatio: {
    hiragana: 0.42,
    katakana: 0.08,
    kanji: 0.28,
    ascii: 0.15,
    emoji: 0.02,
  },
  topEmoji: [
    { emoji: "\u{1F914}", count: 34 },
    { emoji: "\u{1F4AA}", count: 21 },
    { emoji: "\u{2728}", count: 18 },
    { emoji: "\u{1F389}", count: 12 },
    { emoji: "\u{1F40D}", count: 8 },
  ],
  topTokens: [
    { token: "技術", count: 89, isNoun: true },
    { token: "思う", count: 76, isNoun: false },
    { token: "コード", count: 65, isNoun: true },
    { token: "使う", count: 58, isNoun: false },
    { token: "時間", count: 52, isNoun: true },
    { token: "良い", count: 48, isNoun: false },
    { token: "実装", count: 45, isNoun: true },
    { token: "感じ", count: 42, isNoun: true },
  ],
  topNgrams: {
    bigrams: [
      { ngram: "気がする", count: 34 },
      { ngram: "と思う", count: 28 },
      { ngram: "なんだけど", count: 22 },
    ],
    trigrams: [
      { ngram: "気がするな", count: 15 },
      { ngram: "ような気が", count: 12 },
      { ngram: "いい感じに", count: 10 },
    ],
  },
  hourlyDistribution: [
    3, 1, 0, 0, 0, 2, 5, 12, 18, 22, 25, 20, 28, 15, 10, 8, 12, 18, 25, 30,
    28, 22, 15, 8,
  ],
  lineBreaks: {
    tweetsWithBreaks: 0.35,
    avgBreaksPerTweet: 1.2,
  },
  sharingRate: {
    urlRate: 0.15,
    mediaRate: 0.08,
  },
  replyRate: 0.22,
  sampleSize: 2847,
  analyzedAt: Timestamp(Date.now()),
};
