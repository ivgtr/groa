import { openDB, type IDBPDatabase } from "idb";

interface GroaDB {
  config: {
    key: string;
    value: { key: string; value: unknown };
  };
  steps: {
    key: string;
    value: { stepName: string; output: unknown; timestamp: number };
  };
  persona: {
    key: string;
    value: { id: string; document: unknown; createdAt: number };
  };
  embeddings: {
    key: string;
    value: { id: string; index: unknown; createdAt: number };
  };
}

const DB_NAME = "groa";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<GroaDB>> | null = null;

export type { GroaDB };

export function getDb(): Promise<IDBPDatabase<GroaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GroaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("config")) {
          db.createObjectStore("config", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("steps")) {
          db.createObjectStore("steps", { keyPath: "stepName" });
        }
        if (!db.objectStoreNames.contains("persona")) {
          db.createObjectStore("persona", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("embeddings")) {
          db.createObjectStore("embeddings", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}
