import type {
  SessionMode,
  PersonaDocument,
  TaggedTweet,
  EmbeddingIndex,
} from "@groa/types";

// --- SessionParams ---

export interface SessionParams {
  mode: SessionMode;
  topic: string;
  temperature?: number;
  maxLength?: number;
  maxTurns?: number | null;
  autoTurnLimit?: number;
  numVariants?: number;
  styleHint?: string | null;
}

// --- PersonaContext ---

export interface PersonaContext {
  buildName: string;
  persona: PersonaDocument;
  taggedTweets: TaggedTweet[];
  embeddingIndex: EmbeddingIndex;
}
