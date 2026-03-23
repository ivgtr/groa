import type {
  TaggedTweet,
  PersonaDocument,
  VoiceBankEntry,
  Category,
  EmbeddingIndex,
} from "@groa/types";
import { TweetId, Timestamp, ModelIdString } from "@groa/types";
import type { PersonaContext } from "./types.js";

let counter = 0;

export function resetCounter(): void {
  counter = 0;
}

export function makeTaggedTweet(
  category: Category,
  topics: string[] = [],
): TaggedTweet {
  counter++;
  return {
    tweet: {
      id: TweetId(`t${counter}`),
      text: `テスト${counter}のテキスト`,
      timestamp: Timestamp(Date.now() + counter),
      isRetweet: false,
      hasMedia: false,
      replyTo: null,
    },
    category,
    sentiment: "neutral",
    topics,
  };
}

export function makeVoiceBankEntry(
  category: Category,
  topics: string[] = [],
): VoiceBankEntry {
  return {
    tweet: makeTaggedTweet(category, topics),
    selectionReason: `${category}カテゴリの代表`,
  };
}

export function makePersonaDocument(voiceBankCount: number = 8): PersonaDocument {
  const voiceBank: VoiceBankEntry[] = [];
  const categories: Category[] = ["tech", "daily", "opinion", "emotion", "creative", "other"];
  for (let i = 0; i < voiceBankCount; i++) {
    const cat = categories[i % categories.length]!;
    voiceBank.push(makeVoiceBankEntry(cat, cat === "tech" ? ["TypeScript"] : ["日常"]));
  }

  return {
    version: "1.0",
    createdAt: Timestamp(Date.now()),
    body: "# 人物像サマリ\n技術好きのエンジニア。",
    voiceBank,
    attitudePatterns: [],
    contradictions: [],
    sourceStats: { totalCount: 100, dateRange: { start: Timestamp(0), end: Timestamp(1) }, filteredCount: 0 },
  };
}

export function makeEmbeddingIndex(count: number = 10): EmbeddingIndex {
  const embeddings = [];
  for (let i = 1; i <= count; i++) {
    embeddings.push({
      tweetId: TweetId(`t${i}`),
      vector: new Float32Array(384).fill(0.1 * i),
      dimensions: 384,
    });
  }
  return { embeddings, model: ModelIdString("test-model") };
}

export function makePersonaContext(buildName: string = "alice"): PersonaContext {
  const taggedTweets: TaggedTweet[] = [];
  for (let i = 0; i < 10; i++) {
    taggedTweets.push(makeTaggedTweet("tech"));
  }
  return {
    buildName,
    persona: makePersonaDocument(5),
    taggedTweets,
    embeddingIndex: makeEmbeddingIndex(),
  };
}
