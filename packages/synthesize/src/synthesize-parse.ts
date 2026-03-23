import { z } from "zod/v4";
import type {
  PersonaDocument,
  VoiceBankEntry,
  AttitudePattern,
  CorpusMetadata,
} from "@groa/types";
import { TweetId, Timestamp } from "@groa/types";
import { parseLlmResponse } from "@groa/llm-client";

/** LLMレスポンスの AttitudePattern */
const AttitudePatternResponseSchema = z.object({
  name: z.string(),
  description: z.string(),
  exampleTweetIds: z.array(z.string()),
  sourceCategories: z.array(z.string()),
});

/** LLMレスポンス全体のスキーマ */
const SynthesizeResponseSchema = z.object({
  body: z.string(),
  attitudePatterns: z.array(AttitudePatternResponseSchema),
  contradictions: z.array(z.string()),
});

export type SynthesizeResponse = z.infer<typeof SynthesizeResponseSchema>;

/**
 * LLMレスポンスから PersonaDocument を構築する。
 * バリデーション失敗時は null を返す。
 */
export function parseSynthesizeResponse(
  content: string,
  voiceBank: VoiceBankEntry[],
  sourceStats: CorpusMetadata,
): PersonaDocument | null {
  let parsed: SynthesizeResponse;
  try {
    parsed = parseLlmResponse(content, SynthesizeResponseSchema);
  } catch (error) {
    console.warn(
      `ペルソナ合成レスポンスのパースに失敗: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }

  const attitudePatterns: AttitudePattern[] = parsed.attitudePatterns.map(
    (ap) => ({
      name: ap.name,
      description: ap.description,
      exampleTweetIds: ap.exampleTweetIds.map((id) => TweetId(id)),
      sourceCategories: ap.sourceCategories.map(
        (c) => c as AttitudePattern["sourceCategories"][number],
      ),
    }),
  );

  return {
    version: "1.0",
    createdAt: Timestamp(Date.now()),
    body: parsed.body,
    voiceBank,
    attitudePatterns,
    contradictions: parsed.contradictions,
    sourceStats,
  };
}

