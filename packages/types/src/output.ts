import { z } from "zod/v4";
import { TimestampSchema } from "./brand.js";
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
