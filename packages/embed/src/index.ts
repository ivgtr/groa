export { createEmbedder, DEFAULT_MODEL } from "./embedder.js";
export type {
  Embedder,
  EmbedderOptions,
  ModelProgress,
  ProgressCallback,
} from "./embedder.js";

export { generateEmbeddings } from "./generate-embeddings.js";
export type { GenerateEmbeddingsOptions } from "./generate-embeddings.js";

export {
  serializeEmbeddingIndex,
  deserializeEmbeddingIndex,
} from "./serialize.js";
export type { SerializedEmbeddingIndex } from "./serialize.js";
