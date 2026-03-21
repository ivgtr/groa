import { z } from "zod/v4";
import { TweetIdSchema, TimestampSchema } from "./brand.js";
import { TweetSchema } from "./input.js";

// --- Category / Sentiment ---

export const CATEGORIES = [
  "tech",
  "daily",
  "opinion",
  "emotion",
  "creative",
  "other",
] as const;

export const SENTIMENTS = [
  "positive",
  "negative",
  "neutral",
  "mixed",
] as const;

export const CategorySchema = z.enum(CATEGORIES);
export const SentimentSchema = z.enum(SENTIMENTS);

export type Category = z.infer<typeof CategorySchema>;
export type Sentiment = z.infer<typeof SentimentSchema>;

// --- TaggedTweet ---

export const TaggedTweetSchema = z.object({
  tweet: TweetSchema,
  category: CategorySchema,
  sentiment: SentimentSchema,
  topics: z.array(z.string()),
});

export type TaggedTweet = z.infer<typeof TaggedTweetSchema>;

// --- TopicCluster ---

export const TopicClusterSchema = z.object({
  category: CategorySchema,
  tweets: z.array(TaggedTweetSchema),
  tweetCount: z.number(),
});

export type TopicCluster = z.infer<typeof TopicClusterSchema>;

// --- AttitudePattern ---

export const AttitudePatternSchema = z.object({
  name: z.string(),
  description: z.string(),
  exampleTweetIds: z.array(TweetIdSchema),
  sourceCategories: z.array(CategorySchema),
});

export type AttitudePattern = z.infer<typeof AttitudePatternSchema>;

// --- ClusterAnalysis ---

export const ClusterAnalysisSchema = z.object({
  category: CategorySchema,
  tweetCount: z.number(),
  portrait: z.string(),
  representativeTweets: z.array(TaggedTweetSchema),
  attitudePatterns: z.array(AttitudePatternSchema),
});

export type ClusterAnalysis = z.infer<typeof ClusterAnalysisSchema>;

// --- StyleStats ---

const LengthDistributionSchema = z.object({
  mean: z.number(),
  median: z.number(),
  stdDev: z.number(),
  percentiles: z.object({
    p10: z.number(),
    p25: z.number(),
    p75: z.number(),
    p90: z.number(),
  }),
});

const PunctuationSchema = z.object({
  sentenceEnders: z.record(z.string(), z.number()),
  commaStyle: z.record(z.string(), z.number()),
  bracketStyles: z.record(z.string(), z.number()),
});

const SentenceEndingSchema = z.object({
  ending: z.string(),
  frequency: z.number(),
  exampleTweetIds: z.array(TweetIdSchema),
});

const CharTypeRatioSchema = z.object({
  hiragana: z.number(),
  katakana: z.number(),
  kanji: z.number(),
  ascii: z.number(),
  emoji: z.number(),
});

const EmojiEntrySchema = z.object({
  emoji: z.string(),
  count: z.number(),
});

const TokenEntrySchema = z.object({
  token: z.string(),
  count: z.number(),
  isNoun: z.boolean(),
});

const NgramEntrySchema = z.object({
  ngram: z.string(),
  count: z.number(),
});

const NgramsSchema = z.object({
  bigrams: z.array(NgramEntrySchema),
  trigrams: z.array(NgramEntrySchema),
});

const LineBreaksSchema = z.object({
  tweetsWithBreaks: z.number(),
  avgBreaksPerTweet: z.number(),
});

const SharingRateSchema = z.object({
  urlRate: z.number(),
  mediaRate: z.number(),
});

export const StyleStatsSchema = z.object({
  lengthDistribution: LengthDistributionSchema,
  punctuation: PunctuationSchema,
  sentenceEndings: z.array(SentenceEndingSchema),
  charTypeRatio: CharTypeRatioSchema,
  topEmoji: z.array(EmojiEntrySchema),
  topTokens: z.array(TokenEntrySchema),
  topNgrams: NgramsSchema,
  hourlyDistribution: z.array(z.number()),
  lineBreaks: LineBreaksSchema,
  sharingRate: SharingRateSchema,
  replyRate: z.number(),
  sampleSize: z.number(),
  analyzedAt: TimestampSchema,
});

export type StyleStats = z.infer<typeof StyleStatsSchema>;
