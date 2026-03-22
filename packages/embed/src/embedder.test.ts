import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModelIdString } from "@groa/types";
import type { ProgressCallback } from "./embedder.js";

const mockExtractor = vi.fn();
const mockPipeline = vi.fn();

vi.mock("@xenova/transformers", () => ({
  pipeline: mockPipeline,
}));

import { createEmbedder, DEFAULT_MODEL } from "./embedder.js";

// --- createEmbedder ---

describe("createEmbedder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline.mockResolvedValue(mockExtractor);
    mockExtractor.mockResolvedValue({
      tolist: () => [[0.1, 0.2, 0.3]],
    });
  });

  it("デフォルトモデル (multilingual-e5-small) で初期化される", async () => {
    await createEmbedder();

    expect(mockPipeline).toHaveBeenCalledOnce();
    expect(mockPipeline).toHaveBeenCalledWith(
      "feature-extraction",
      DEFAULT_MODEL,
      expect.objectContaining({ quantized: true }),
    );
  });

  it("カスタムモデル名で初期化できる", async () => {
    await createEmbedder({ model: ModelIdString("custom/model") });

    expect(mockPipeline).toHaveBeenCalledWith(
      "feature-extraction",
      "custom/model",
      expect.objectContaining({ quantized: true }),
    );
  });

  it("進捗コールバックが pipeline に渡される", async () => {
    const onProgress: ProgressCallback = vi.fn();
    await createEmbedder({ onProgress });

    const options = mockPipeline.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(options.progress_callback).toBe(onProgress);
  });

  it("進捗コールバック未指定時は progress_callback が含まれない", async () => {
    await createEmbedder();

    const options = mockPipeline.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(options).not.toHaveProperty("progress_callback");
  });

  it("Embedder インターフェースを満たすオブジェクトを返す", async () => {
    const embedder = await createEmbedder();

    expect(typeof embedder.embed).toBe("function");
    expect(typeof embedder.embedQuery).toBe("function");
  });
});

// --- Embedder.embed ---

describe("Embedder.embed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline.mockResolvedValue(mockExtractor);
  });

  it("テキストに 'passage: ' プレフィックスを付与して extractor を呼ぶ", async () => {
    mockExtractor.mockResolvedValue({
      tolist: () => [[0.1, 0.2, 0.3]],
    });

    const embedder = await createEmbedder();
    await embedder.embed(["テスト"]);

    expect(mockExtractor).toHaveBeenCalledWith(["passage: テスト"], {
      pooling: "mean",
      normalize: true,
    });
  });

  it("複数テキストを一括処理する", async () => {
    mockExtractor.mockResolvedValue({
      tolist: () => [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ],
    });

    const embedder = await createEmbedder();
    const result = await embedder.embed(["テスト1", "テスト2"]);

    expect(mockExtractor).toHaveBeenCalledWith(
      ["passage: テスト1", "passage: テスト2"],
      { pooling: "mean", normalize: true },
    );
    expect(result).toHaveLength(2);
  });

  it("Float32Array[] を返す", async () => {
    mockExtractor.mockResolvedValue({
      tolist: () => [[0.1, 0.2, 0.3]],
    });

    const embedder = await createEmbedder();
    const result = await embedder.embed(["テスト"]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(Float32Array);
    expect(result[0]!.length).toBe(3);
  });

  it("batchSize を超える入力は複数バッチに分割される", async () => {
    mockExtractor
      .mockResolvedValueOnce({ tolist: () => [[0.1], [0.2]] })
      .mockResolvedValueOnce({ tolist: () => [[0.3]] });

    const embedder = await createEmbedder({ batchSize: 2 });
    const result = await embedder.embed(["a", "b", "c"]);

    expect(mockExtractor).toHaveBeenCalledTimes(2);
    expect(mockExtractor).toHaveBeenNthCalledWith(
      1,
      ["passage: a", "passage: b"],
      { pooling: "mean", normalize: true },
    );
    expect(mockExtractor).toHaveBeenNthCalledWith(
      2,
      ["passage: c"],
      { pooling: "mean", normalize: true },
    );
    expect(result).toHaveLength(3);
  });

  it("空配列を渡すと空配列を返す", async () => {
    const embedder = await createEmbedder();
    const result = await embedder.embed([]);

    expect(result).toEqual([]);
    expect(mockExtractor).not.toHaveBeenCalled();
  });
});

// --- Embedder.embedQuery ---

describe("Embedder.embedQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline.mockResolvedValue(mockExtractor);
  });

  it("テキストに 'query: ' プレフィックスを付与して extractor を呼ぶ", async () => {
    mockExtractor.mockResolvedValue({
      tolist: () => [[0.1, 0.2, 0.3]],
    });

    const embedder = await createEmbedder();
    await embedder.embedQuery("検索クエリ");

    expect(mockExtractor).toHaveBeenCalledWith(["query: 検索クエリ"], {
      pooling: "mean",
      normalize: true,
    });
  });

  it("単一の Float32Array を返す", async () => {
    mockExtractor.mockResolvedValue({
      tolist: () => [[0.1, 0.2, 0.3]],
    });

    const embedder = await createEmbedder();
    const result = await embedder.embedQuery("テスト");

    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(3);
  });
});
