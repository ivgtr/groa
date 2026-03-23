import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Session, SessionMode } from "@groa/types";
import { SessionSchema } from "@groa/types";
import { stripSensitiveData, assertNoApiKeys } from "./sanitize.js";

const SESSIONS_DIR = "sessions";

/** セッション一覧用のメタ情報 */
export interface SessionMeta {
  id: string;
  mode: SessionMode;
  topic: string;
  turnCount: number;
  participants: string[];
  completedAt: number | null;
  filePath: string;
}

/** セッション一覧のフィルタ */
export interface SessionFilter {
  buildName?: string;
  mode?: SessionMode;
}

/**
 * セッションログの永続化を管理する。
 * `.groa/sessions/{sessionId}.json` に保存する。
 */
export class SessionStore {
  private readonly sessionsDir: string;

  constructor(baseDir: string) {
    this.sessionsDir = join(baseDir, SESSIONS_DIR);
  }

  /** セッションを保存する。ファイルパスを返す。 */
  async save(session: Session): Promise<string> {
    await mkdir(this.sessionsDir, { recursive: true });

    const sanitized = stripSensitiveData(session);
    const json = JSON.stringify(sanitized, null, 2);
    assertNoApiKeys(json, `セッションログ (session: ${session.id})`);

    const filePath = this.filePath(session.id);
    await writeFile(filePath, json, "utf-8");
    return filePath;
  }

  /** セッションを読み込む。存在しなければ null。 */
  async load(sessionId: string): Promise<Session | null> {
    const filePath = this.filePath(sessionId);
    try {
      const content = await readFile(filePath, "utf-8");
      const data: unknown = JSON.parse(content);
      return SessionSchema.parse(data);
    } catch {
      return null;
    }
  }

  /** セッション一覧を取得する。フィルタで絞り込み可能。 */
  async list(filter?: SessionFilter): Promise<SessionMeta[]> {
    let files: string[];
    try {
      files = await readdir(this.sessionsDir);
    } catch {
      return [];
    }

    const results: SessionMeta[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      try {
        const content = await readFile(join(this.sessionsDir, file), "utf-8");
        const data = SessionSchema.parse(JSON.parse(content));

        if (filter?.mode && data.mode !== filter.mode) continue;
        if (
          filter?.buildName &&
          !data.participants.some((p) => p.buildName === filter.buildName)
        ) {
          continue;
        }

        results.push({
          id: data.id,
          mode: data.mode,
          topic: data.topic,
          turnCount: data.turns.length,
          participants: data.participants.map((p) => p.buildName),
          completedAt: data.completedAt,
          filePath: join(this.sessionsDir, file),
        });
      } catch {
        // 破損ファイルはスキップ
      }
    }

    return results;
  }

  private filePath(sessionId: string): string {
    return join(this.sessionsDir, `${sessionId}.json`);
  }
}
