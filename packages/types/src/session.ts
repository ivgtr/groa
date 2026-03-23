import { z } from "zod/v4";
import { TweetIdSchema, TimestampSchema, ModelIdStringSchema } from "./brand.js";

// --- SessionMode ---

export const SESSION_MODES = ["tweet", "converse", "multi", "chat"] as const;
export const SessionModeSchema = z.enum(SESSION_MODES);
export type SessionMode = z.infer<typeof SessionModeSchema>;

// --- SessionParticipant ---

export const PARTICIPANT_ROLES = ["persona", "human"] as const;

export const SessionParticipantSchema = z.object({
  buildName: z.string(),
  role: z.enum(PARTICIPANT_ROLES),
});

export type SessionParticipant = z.infer<typeof SessionParticipantSchema>;

// --- SessionTurn ---

export const SessionTurnSchema = z.object({
  index: z.number(),
  speakerId: z.string(),
  text: z.string(),
  fewShotIds: z.array(TweetIdSchema),
  modelUsed: ModelIdStringSchema,
  timestamp: TimestampSchema,
});

export type SessionTurn = z.infer<typeof SessionTurnSchema>;

// --- SessionEvaluation ---

export const SessionEvaluationSchema = z.object({
  authenticity: z.number(),
  coherence: z.number(),
  consistency: z.number(),
  rationale: z.string(),
});

export type SessionEvaluation = z.infer<typeof SessionEvaluationSchema>;

// --- Session ---

export const SessionSchema = z.object({
  id: z.string(),
  mode: SessionModeSchema,
  topic: z.string(),
  participants: z.array(SessionParticipantSchema),
  turns: z.array(SessionTurnSchema),
  evaluation: SessionEvaluationSchema.nullable(),
  createdAt: TimestampSchema,
  completedAt: TimestampSchema.nullable(),
});

export type Session = z.infer<typeof SessionSchema>;
