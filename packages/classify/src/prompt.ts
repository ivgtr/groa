import type { Tweet } from "@groa/types";
import { CATEGORIES, SENTIMENTS } from "@groa/types";

const CATEGORY_LIST = CATEGORIES.map((c) => `- "${c}"`).join("\n");
const SENTIMENT_LIST = SENTIMENTS.map((s) => `- "${s}"`).join("\n");

const SYSTEM_PROMPT = `あなたはツイート分類の専門家です。与えられたツイート群それぞれに対して、カテゴリ・感情ラベル・トピックタグを付与してください。

## カテゴリ（category）
以下の6種のいずれか1つを選択:
${CATEGORY_LIST}

## 感情ラベル（sentiment）
以下の4種のいずれか1つを選択:
${SENTIMENT_LIST}

## トピックタグ（topics）
ツイートの内容を表すキーワードを最大5件。短い名詞句で記述。

## 出力フォーマット
以下のJSON Array形式のみを出力してください。JSON以外のテキストは含めないでください。

[
  {
    "tweetId": "ツイートのID",
    "category": "カテゴリ値",
    "sentiment": "感情ラベル値",
    "topics": ["トピック1", "トピック2"]
  }
]`;

export { SYSTEM_PROMPT };

/**
 * 分類プロンプトを構築する。
 * @param tweets 分類対象のツイート群
 * @returns system / user メッセージのペア
 */
export function buildClassifyPrompt(tweets: Tweet[]): {
  system: string;
  user: string;
} {
  const tweetList = tweets.map((t) => ({
    id: t.id,
    text: t.text,
  }));

  return {
    system: SYSTEM_PROMPT,
    user: `以下の${tweets.length}件のツイートを分類してください:\n\n${JSON.stringify(tweetList, null, 2)}`,
  };
}
