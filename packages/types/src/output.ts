import { z } from "zod/v4";
import { TweetIdSchema, TimestampSchema, ModelIdStringSchema } from "./brand.js";
import { CorpusMetadataSchema } from "./input.js";
import { TaggedTweetSchema, AttitudePatternSchema } from "./intermediate.js";

// --- VoiceBankEntry ---

export const VoiceBankEntrySchema = z.object({
  tweet: TaggedTweetSchema,
  selectionReason: z.string(),
});

export type VoiceBankEntry = z.infer<typeof VoiceBankEntrySchema>;

// --- PersonaDocument ---

export const PersonaDocumentSchema = z.object({
  version: z.string(),
  createdAt: TimestampSchema,
  body: z.string(),
  voiceBank: z.array(VoiceBankEntrySchema),
  attitudePatterns: z.array(AttitudePatternSchema),
  contradictions: z.array(z.string()),
  sourceStats: CorpusMetadataSchema,
});

export type PersonaDocument = z.infer<typeof PersonaDocumentSchema>;

// --- EvaluationResult ---

export const EvaluationResultSchema = z.object({
  authenticity: z.number(),
  styleNaturalness: z.number(),
  attitudeConsistency: z.number(),
  rationale: z.string(),
});

export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

// --- GeneratedText ---

export const GeneratedTextSchema = z.object({
  text: z.string(),
  topic: z.string(),
  evaluation: EvaluationResultSchema.nullable(),
  fewShotIds: z.array(TweetIdSchema),
  modelUsed: ModelIdStringSchema,
});

export type GeneratedText = z.infer<typeof GeneratedTextSchema>;
