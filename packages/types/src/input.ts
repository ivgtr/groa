import { z } from "zod/v4";
import { TweetIdSchema, TimestampSchema } from "./brand.js";

// --- DateRange ---

export const DateRangeSchema = z.object({
  start: TimestampSchema,
  end: TimestampSchema,
});

export type DateRange = z.infer<typeof DateRangeSchema>;

// --- CorpusMetadata ---

export const CorpusMetadataSchema = z.object({
  totalCount: z.number(),
  dateRange: DateRangeSchema,
  filteredCount: z.number(),
});

export type CorpusMetadata = z.infer<typeof CorpusMetadataSchema>;

// --- Tweet ---

export const TweetSchema = z.object({
  id: TweetIdSchema,
  text: z.string(),
  timestamp: TimestampSchema,
  isRetweet: z.boolean(),
  hasMedia: z.boolean(),
  replyTo: TweetIdSchema.nullable(),
});

export type Tweet = z.infer<typeof TweetSchema>;

// --- TweetCorpus ---

export const TweetCorpusSchema = z.object({
  tweets: z.array(TweetSchema),
  metadata: CorpusMetadataSchema,
});

export type TweetCorpus = z.infer<typeof TweetCorpusSchema>;
