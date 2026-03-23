import { z } from "zod/v4";
import type { TopicCluster, ClusterAnalysis, TaggedTweet } from "@groa/types";
import { TweetId } from "@groa/types";
import { parseLlmResponse } from "@groa/llm-client";

/** LLMレスポンスの representativeTweet エントリ */
const RepresentativeTweetSchema = z.object({
  tweetId: z.string(),
  reason: z.string(),
});

/** LLMレスポンスの attitudePattern エントリ */
const AttitudePatternResponseSchema = z.object({
  name: z.string(),
  description: z.string(),
  exampleTweetIds: z.array(z.string()),
});

/** LLMレスポンス全体のスキーマ */
const AnalyzeResponseSchema = z.object({
  portrait: z.string(),
  representativeTweets: z.array(RepresentativeTweetSchema),
  attitudePatterns: z.array(AttitudePatternResponseSchema),
});

export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

/**
 * LLMレスポンスから ClusterAnalysis をパースする。
 * バリデーション失敗時は null を返す。
 */
export function parseAnalyzeResponse(
  content: string,
  cluster: TopicCluster,
): ClusterAnalysis | null {
  let parsed: AnalyzeResponse;
  try {
    parsed = parseLlmResponse(content, AnalyzeResponseSchema);
  } catch (error) {
    console.warn(
      `クラスタ "${cluster.category}" の分析レスポンスのパースに失敗しました: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }

  // tweetId → TaggedTweet のマッピング
  const tweetMap = new Map<string, TaggedTweet>(
    cluster.tweets.map((tt) => [tt.tweet.id, tt]),
  );

  // representativeTweets: IDを実体に変換（存在しないIDは除外）
  const representativeTweets = parsed.representativeTweets
    .map((rt) => tweetMap.get(rt.tweetId))
    .filter((tt): tt is TaggedTweet => tt != null)
    .slice(0, 10);

  // attitudePatterns: exampleTweetIds を実在IDのみに絞る
  const attitudePatterns = parsed.attitudePatterns.map((ap) => ({
    name: ap.name,
    description: ap.description,
    exampleTweetIds: ap.exampleTweetIds
      .filter((id) => tweetMap.has(id))
      .map((id) => TweetId(id)),
    sourceCategories: [cluster.category],
  }));

  return {
    category: cluster.category,
    tweetCount: cluster.tweetCount,
    portrait: parsed.portrait,
    representativeTweets,
    attitudePatterns,
  };
}

