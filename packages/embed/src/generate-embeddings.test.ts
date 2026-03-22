import { describe, it, expect, vi } from "vitest";
import { TweetId, Timestamp, ModelIdString } from "@groa/types";
import type { TweetCorpus, EmbeddingIndex } from "@groa/types";
import type { Embedder } from "./embedder.js";
import { DEFAULT_MODEL } from "./embedder.js";
import { generateEmbeddings } from "./generate-embeddings.js";
import {
  serializeEmbeddingIndex,
  deserializeEmbeddingIndex,
} from "./serialize.js";

function makeCorpus(count: number): TweetCorpus {
  return {
    tweets: Array.from({ length: count }, (_, i) => ({
      id: TweetId(`tweet-${i}`),
      text: `テスト投稿 ${i}`,
      timestamp: Timestamp(1700000000000 + i * 1000),
      isRetweet: false,
      hasMedia: false,
      replyTo: null,
    })),
    metadata: {
      totalCount: count,
      dateRange: {
        start: Timestamp(1700000000000),
        end: Timestamp(1700000000000 + (count - 1) * 1000),
      },
      filteredCount: 0,
    },
  };
}

function makeMockEmbedder(dimensions: number = 384): Embedder {
  return {
    embed: vi.fn(async (texts: string[]) =>
      texts.map(() => new Float32Array(dimensions).fill(0.1)),
    ),
    embedQuery: vi.fn(async () => new Float32Array(dimensions).fill(0.1)),
  };
}

// --- generateEmbeddings ---

describe("generateEmbeddings", () => {
  it("TweetCorpus の全ツイートに対してEmbeddingが生成される", async () => {
    const corpus = makeCorpus(5);
    const embedder = makeMockEmbedder();
    const result = await generateEmbeddings(corpus, embedder);

    expect(result.embeddings).toHaveLength(5);
  });

  it("各Embeddingが384次元のFloat32Arrayを持つ", async () => {
    const corpus = makeCorpus(3);
    const embedder = makeMockEmbedder(384);
    const result = await generateEmbeddings(corpus, embedder);

    for (const e of result.embeddings) {
      expect(e.vector).toBeInstanceOf(Float32Array);
      expect(e.dimensions).toBe(384);
      expect(e.vector.length).toBe(384);
    }
  });

  it("各EmbeddingにtweetIdが正しく紐付けられる", async () => {
    const corpus = makeCorpus(3);
    const embedder = makeMockEmbedder();
    const result = await generateEmbeddings(corpus, embedder);

    expect(result.embeddings[0]!.tweetId).toBe("tweet-0");
    expect(result.embeddings[1]!.tweetId).toBe("tweet-1");
    expect(result.embeddings[2]!.tweetId).toBe("tweet-2");
  });

  it("デフォルトモデルIDが設定される", async () => {
    const corpus = makeCorpus(1);
    const embedder = makeMockEmbedder();
    const result = await generateEmbeddings(corpus, embedder);

    expect(result.model).toBe(DEFAULT_MODEL);
  });

  it("カスタムモデルIDを指定できる", async () => {
    const corpus = makeCorpus(1);
    const embedder = makeMockEmbedder();
    const result = await generateEmbeddings(corpus, embedder, {
      model: ModelIdString("custom-model"),
    });

    expect(result.model).toBe("custom-model");
  });

  it("embedder.embed が全テキストで呼ばれる", async () => {
    const corpus = makeCorpus(3);
    const embedder = makeMockEmbedder();
    await generateEmbeddings(corpus, embedder);

    expect(embedder.embed).toHaveBeenCalledWith([
      "テスト投稿 0",
      "テスト投稿 1",
      "テスト投稿 2",
    ]);
  });
});

// --- serializeEmbeddingIndex ---

describe("serializeEmbeddingIndex", () => {
  it("Float32Arrayをnumber[]に変換する", () => {
    const index: EmbeddingIndex = {
      embeddings: [
        {
          tweetId: TweetId("tweet-0"),
          vector: new Float32Array([0.1, 0.2, 0.3]),
          dimensions: 3,
        },
      ],
      model: ModelIdString("test-model"),
    };

    const serialized = serializeEmbeddingIndex(index);

    expect(serialized.embeddings[0]!.vector).toBeInstanceOf(Array);
    expect(serialized.embeddings[0]!.vector).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.2),
      expect.closeTo(0.3),
    ]);
  });

  it("JSON.stringifyで正しくシリアライズできる", () => {
    const index: EmbeddingIndex = {
      embeddings: [
        {
          tweetId: TweetId("tweet-0"),
          vector: new Float32Array([0.5]),
          dimensions: 1,
        },
      ],
      model: ModelIdString("test-model"),
    };

    const serialized = serializeEmbeddingIndex(index);
    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed).toHaveProperty("embeddings");
    expect(parsed).toHaveProperty("model", "test-model");
  });
});

// --- deserializeEmbeddingIndex ---

describe("deserializeEmbeddingIndex", () => {
  it("number[]からFloat32Arrayに復元する", () => {
    const data = {
      embeddings: [
        { tweetId: "tweet-0", vector: [0.1, 0.2, 0.3], dimensions: 3 },
      ],
      model: "test-model",
    };

    const result = deserializeEmbeddingIndex(data);

    expect(result.embeddings[0]!.vector).toBeInstanceOf(Float32Array);
    expect(result.embeddings[0]!.vector.length).toBe(3);
  });

  it("シリアライズ→デシリアライズのラウンドトリップが成功する", () => {
    const original: EmbeddingIndex = {
      embeddings: [
        {
          tweetId: TweetId("tweet-0"),
          vector: new Float32Array([0.1, 0.2, 0.3]),
          dimensions: 3,
        },
        {
          tweetId: TweetId("tweet-1"),
          vector: new Float32Array([0.4, 0.5, 0.6]),
          dimensions: 3,
        },
      ],
      model: ModelIdString("test-model"),
    };

    const serialized = serializeEmbeddingIndex(original);
    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json) as unknown;
    const restored = deserializeEmbeddingIndex(parsed);

    expect(restored.embeddings).toHaveLength(2);
    expect(restored.embeddings[0]!.tweetId).toBe("tweet-0");
    expect(restored.embeddings[0]!.vector).toBeInstanceOf(Float32Array);
    expect(restored.embeddings[1]!.tweetId).toBe("tweet-1");
    expect(restored.model).toBe("test-model");
  });
});
