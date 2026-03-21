import { describe, it, expect } from "vitest";
import {
  TweetId,
  Timestamp,
  ModelIdString,
  TweetIdSchema,
  TimestampSchema,
  ModelIdStringSchema,
} from "./brand.js";

describe("Branded Types", () => {
  describe("ファクトリ関数", () => {
    it("TweetId は文字列から生成できる", () => {
      const id = TweetId("tweet-123");
      expect(id).toBe("tweet-123");
    });

    it("Timestamp は数値から生成できる", () => {
      const ts = Timestamp(1700000000000);
      expect(ts).toBe(1700000000000);
    });

    it("ModelIdString は文字列から生成できる", () => {
      const model = ModelIdString("claude-sonnet-4-20250514");
      expect(model).toBe("claude-sonnet-4-20250514");
    });
  });

  describe("Zod スキーマ", () => {
    it("TweetIdSchema は文字列をパースできる", () => {
      const result = TweetIdSchema.safeParse("tweet-456");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("tweet-456");
      }
    });

    it("TweetIdSchema は数値を拒否する", () => {
      const result = TweetIdSchema.safeParse(123);
      expect(result.success).toBe(false);
    });

    it("TimestampSchema は数値をパースできる", () => {
      const result = TimestampSchema.safeParse(1700000000000);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(1700000000000);
      }
    });

    it("TimestampSchema は文字列を拒否する", () => {
      const result = TimestampSchema.safeParse("not-a-number");
      expect(result.success).toBe(false);
    });

    it("ModelIdStringSchema は文字列をパースできる", () => {
      const result = ModelIdStringSchema.safeParse("claude-sonnet-4-20250514");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("claude-sonnet-4-20250514");
      }
    });
  });
});
