import { z } from "zod/v4";
import type { Tweet, TaggedTweet, Category, Sentiment } from "@groa/types";
import { CategorySchema, SentimentSchema } from "@groa/types";

/** LLMレスポンスの1エントリのZodスキーマ */
const ClassifyEntrySchema = z.object({
  tweetId: z.string(),
  category: CategorySchema,
  sentiment: SentimentSchema,
  topics: z.array(z.string()),
});

export type ClassifyEntry = z.infer<typeof ClassifyEntrySchema>;

export interface ParseResult {
  tagged: TaggedTweet[];
  fallbackCount: number;
}

const FALLBACK_CATEGORY: Category = "other";
const FALLBACK_SENTIMENT: Sentiment = "neutral";

/**
 * LLMレスポンスからTaggedTweet[]をパースする。
 * バリデーション失敗のツイートにはフォールバック値を適用する。
 */
export function parseClassifyResponse(
  content: string,
  tweets: Tweet[],
): ParseResult {
  const tweetMap = new Map<string, Tweet>(tweets.map((t) => [t.id, t]));
  const jsonContent = extractJson(content);

  let rawEntries: unknown[];
  try {
    const parsed: unknown = JSON.parse(jsonContent);
    if (!Array.isArray(parsed)) {
      return allFallback(tweets);
    }
    rawEntries = parsed;
  } catch {
    return allFallback(tweets);
  }

  const tagged: TaggedTweet[] = [];
  let fallbackCount = 0;
  const processedIds = new Set<string>();

  for (const raw of rawEntries) {
    const result = ClassifyEntrySchema.safeParse(raw);
    if (!result.success) {
      // エントリのバリデーション失敗: tweetIdが取れればフォールバック対象として記録
      const tweetId =
        typeof raw === "object" &&
        raw !== null &&
        "tweetId" in raw &&
        typeof (raw as { tweetId: unknown }).tweetId === "string"
          ? (raw as { tweetId: string }).tweetId
          : null;
      const fallbackTweet = tweetId ? tweetMap.get(tweetId) : undefined;
      if (tweetId && fallbackTweet) {
        processedIds.add(tweetId);
        tagged.push({
          tweet: fallbackTweet,
          category: FALLBACK_CATEGORY,
          sentiment: FALLBACK_SENTIMENT,
          topics: [],
        });
        fallbackCount++;
        console.warn(
          `ツイート ${tweetId} の分類バリデーション失敗。フォールバック値を適用。`,
        );
      }
      continue;
    }

    const entry = result.data;
    if (processedIds.has(entry.tweetId)) continue;
    const tweet = tweetMap.get(entry.tweetId);
    if (!tweet) continue;

    processedIds.add(entry.tweetId);
    tagged.push({
      tweet,
      category: entry.category,
      sentiment: entry.sentiment,
      topics: entry.topics.slice(0, 5),
    });
  }

  // LLMが返さなかったツイートはフォールバック
  for (const tweet of tweets) {
    if (!processedIds.has(tweet.id)) {
      tagged.push({
        tweet,
        category: FALLBACK_CATEGORY,
        sentiment: FALLBACK_SENTIMENT,
        topics: [],
      });
      fallbackCount++;
    }
  }

  return { tagged, fallbackCount };
}

/** JSON文字列を抽出する（コードブロック対応） */
function extractJson(content: string): string {
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];

  return content.trim();
}

function allFallback(tweets: Tweet[]): ParseResult {
  return {
    tagged: tweets.map((tweet) => ({
      tweet,
      category: FALLBACK_CATEGORY,
      sentiment: FALLBACK_SENTIMENT,
      topics: [],
    })),
    fallbackCount: tweets.length,
  };
}
