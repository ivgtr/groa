import type { Category } from "@groa/types";
import type { ClusterWithStats } from "./cluster-stats.js";

const MAX_TWEETS_IN_PROMPT = 200;

/** カテゴリ別の分析観点 */
const CATEGORY_PERSPECTIVES: Record<Category, string> = {
  tech: "技術に対する態度、説明の仕方、深掘り度",
  daily: "日常のトーン、自己開示の程度、雑談スタイル",
  opinion: "主張の仕方、根拠の示し方、反論への態度",
  emotion: "感情表現の幅、引き金、表出スタイル",
  creative: "創造性の発揮パターン、比喩・言葉遊び",
  other: "上記カテゴリに収まらないツイート群の共通パターン",
};

const SYSTEM_PROMPT = `あなたはツイートから人格特徴を抽出する分析の専門家です。
与えられたカテゴリのツイート群と統計データを分析し、この人物のこのモードにおける特徴を抽出してください。

## 出力フォーマット
以下のJSON形式のみを出力してください。JSON以外のテキストは含めないでください。

{
  "portrait": "このモードでの人物像の記述（500-1500字）。統計値の羅列ではなく「この人は〜するとき、〜する傾向がある」のような行動描写で記述すること。",
  "representativeTweets": [
    { "tweetId": "選定したツイートのID", "reason": "選定理由" }
  ],
  "attitudePatterns": [
    {
      "name": "パターン名",
      "description": "パターンの説明",
      "exampleTweetIds": ["実例ツイートID1", "実例ツイートID2"]
    }
  ]
}

## 制約
- portrait: 500-1500字の自然言語。具体例を交えた行動描写であること
- representativeTweets: 人物らしさが凝縮されたツイートを最大10件選定し、各選定理由を記載
- attitudePatterns: 典型的な態度パターンを3-5件抽出。各パターンに名前・説明・実例ツイートIDを紐づけ
- tweetId は提示されたツイート一覧に存在するIDのみ使用すること`;

/**
 * クラスタ分析プロンプトを構築する。
 */
export function buildAnalyzePrompt(cws: ClusterWithStats): {
  system: string;
  user: string;
} {
  const { cluster, stats } = cws;
  const perspective = CATEGORY_PERSPECTIVES[cluster.category];

  // ツイートサンプリング（大クラスタは均等間隔で抽出）
  const sampledTweets =
    cluster.tweets.length <= MAX_TWEETS_IN_PROMPT
      ? cluster.tweets
      : sampleEvenly(cluster.tweets, MAX_TWEETS_IN_PROMPT);

  const tweetList = sampledTweets.map((tt) => ({
    id: tt.tweet.id,
    text: tt.tweet.text,
    sentiment: tt.sentiment,
  }));

  const endingsSection = stats.sentenceEndings
    .map(
      (e) =>
        `- "${e.ending}" (${e.frequency}件) 例: ${e.exampleTweetIds.slice(0, 2).join(", ")}`,
    )
    .join("\n");

  const tokensSection = stats.topTokens
    .map((t) => `- "${t.token}" (${t.count}件${t.isNoun ? ", 名詞" : ""})`)
    .join("\n");

  const user = `## 分析対象
カテゴリ: ${cluster.category}
ツイート数: ${cluster.tweetCount}件（以下に${sampledTweets.length}件を提示）
分析観点: ${perspective}

## 統計データ（クラスタ固有）

### 語尾パターン上位5件
${endingsSection || "（データなし）"}

### 頻出表現上位10件
${tokensSection || "（データなし）"}

## ツイート一覧
${JSON.stringify(tweetList, null, 2)}`;

  return { system: SYSTEM_PROMPT, user };
}

/** 配列から均等間隔でサンプリングする */
function sampleEvenly<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = items.length / count;
  const result: T[] = [];
  for (let i = 0; i < count; i++) {
    result.push(items[Math.floor(i * step)]);
  }
  return result;
}

export { SYSTEM_PROMPT as ANALYZE_SYSTEM_PROMPT, MAX_TWEETS_IN_PROMPT };
