import { getDb } from "./db.js";

export class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageQuotaError";
  }
}

async function withQuotaHandling<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new StorageQuotaError(
        "ストレージの容量が不足しています。不要なデータを削除してください。",
      );
    }
    throw error;
  }
}

// --- Config (excluding API keys) ---

export async function saveConfig(
  config: Record<string, unknown>,
): Promise<void> {
  const sanitized = { ...config };
  delete sanitized.apiKeys;

  await withQuotaHandling(async () => {
    const db = await getDb();
    await db.put("config", { key: "current", value: sanitized });
  });
}

export async function loadConfig(): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  const entry = await db.get("config", "current");
  if (!entry) return null;
  return entry.value as Record<string, unknown>;
}

// --- Step intermediate results ---

export async function saveStepResult(
  stepName: string,
  output: unknown,
): Promise<void> {
  await withQuotaHandling(async () => {
    const db = await getDb();
    await db.put("steps", { stepName, output, timestamp: Date.now() });
  });
}

export async function loadStepResult(
  stepName: string,
): Promise<unknown | null> {
  const db = await getDb();
  const entry = await db.get("steps", stepName);
  if (!entry) return null;
  return entry.output;
}

export async function clearStepResults(): Promise<void> {
  const db = await getDb();
  await db.clear("steps");
}

// --- PersonaDocument ---

export async function savePersonaDocument(doc: unknown): Promise<void> {
  await withQuotaHandling(async () => {
    const db = await getDb();
    await db.put("persona", {
      id: "current",
      document: doc,
      createdAt: Date.now(),
    });
  });
}

export async function loadPersonaDocument(): Promise<unknown | null> {
  const db = await getDb();
  const entry = await db.get("persona", "current");
  if (!entry) return null;
  return entry.document;
}

// --- EmbeddingIndex ---

export async function saveEmbeddingIndex(index: unknown): Promise<void> {
  await withQuotaHandling(async () => {
    const db = await getDb();
    await db.put("embeddings", {
      id: "current",
      index,
      createdAt: Date.now(),
    });
  });
}

export async function loadEmbeddingIndex(): Promise<unknown | null> {
  const db = await getDb();
  const entry = await db.get("embeddings", "current");
  if (!entry) return null;
  return entry.index;
}

// --- Export ---

export function exportAsJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Clear all ---

export async function clearAll(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.clear("config"),
    db.clear("steps"),
    db.clear("persona"),
    db.clear("embeddings"),
  ]);
}
