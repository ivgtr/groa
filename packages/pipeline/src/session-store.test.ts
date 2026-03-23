import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Session } from "@groa/types";
import { Timestamp, ModelIdString } from "@groa/types";
import { SessionStore } from "./session-store.js";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "tweet-20260323-abc123",
    mode: "tweet",
    topic: "AIの未来",
    participants: [{ buildName: "alice", role: "persona" }],
    turns: [
      {
        index: 0,
        speakerId: "alice",
        text: "AIは社会を変えていく",
        fewShotIds: [],
        modelUsed: ModelIdString("test-model"),
        timestamp: Timestamp(Date.now()),
      },
    ],
    evaluation: null,
    createdAt: Timestamp(Date.now()),
    completedAt: Timestamp(Date.now()),
    ...overrides,
  };
}

let tmpDir: string;
let store: SessionStore;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "groa-session-test-"));
  store = new SessionStore(tmpDir);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("SessionStore", () => {
  describe("save / load", () => {
    it("セッションを保存して読み込める", async () => {
      const session = makeSession();
      const filePath = await store.save(session);

      expect(filePath).toContain("abc123");

      const loaded = await store.load(session.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(session.id);
      expect(loaded!.mode).toBe("tweet");
      expect(loaded!.turns).toHaveLength(1);
      expect(loaded!.turns[0]!.text).toBe("AIは社会を変えていく");
    });

    it("存在しないセッションIDでnullを返す", async () => {
      const loaded = await store.load("nonexistent");
      expect(loaded).toBeNull();
    });
  });

  describe("list", () => {
    it("保存済みセッション一覧を返す", async () => {
      await store.save(makeSession({ id: "tweet-20260323-aaa111" }));
      await store.save(
        makeSession({
          id: "converse-20260323-bbb222",
          mode: "converse",
          participants: [{ buildName: "bob", role: "persona" }],
        }),
      );

      const all = await store.list();
      expect(all).toHaveLength(2);
    });

    it("modeでフィルタできる", async () => {
      await store.save(makeSession({ id: "tweet-20260323-aaa111" }));
      await store.save(
        makeSession({ id: "converse-20260323-bbb222", mode: "converse" }),
      );

      const tweets = await store.list({ mode: "tweet" });
      expect(tweets).toHaveLength(1);
      expect(tweets[0]!.mode).toBe("tweet");
    });

    it("buildNameでフィルタできる", async () => {
      await store.save(makeSession({ id: "tweet-20260323-aaa111" }));
      await store.save(
        makeSession({
          id: "tweet-20260323-bbb222",
          participants: [{ buildName: "bob", role: "persona" }],
        }),
      );

      const bobSessions = await store.list({ buildName: "bob" });
      expect(bobSessions).toHaveLength(1);
      expect(bobSessions[0]!.participants).toContain("bob");
    });

    it("空ディレクトリでは空配列を返す", async () => {
      const all = await store.list();
      expect(all).toEqual([]);
    });
  });

  describe("APIキーサニタイズ", () => {
    it("APIキーフィールドが[REDACTED]にサニタイズされて保存される", async () => {
      const session = makeSession();
      // セッションに apiKey フィールドを追加
      const sessionWithKey = { ...session, apiKey: "sk-ant-secret-key-12345" };
      const filePath = await store.save(sessionWithKey as Session);

      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("[REDACTED]");
      expect(content).not.toContain("sk-ant-secret-key-12345");
    });

    it("テキストにAPIキーパターンが含まれる場合エラーをスローする", async () => {
      const session = makeSession({
        turns: [
          {
            index: 0,
            speakerId: "alice",
            text: "APIキーは sk-ant-api03-xxxxx です",
            fewShotIds: [],
            modelUsed: ModelIdString("test-model"),
            timestamp: Timestamp(Date.now()),
          },
        ],
      });

      await expect(store.save(session)).rejects.toThrow(
        "APIキーが含まれています",
      );
    });
  });
});
