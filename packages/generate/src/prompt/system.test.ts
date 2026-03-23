import { describe, it, expect, beforeEach } from "vitest";
import {
  resetCounter,
  makeVoiceBankEntry,
  makePersonaDocument,
} from "../test-helpers.js";
import { buildSystemPrompt, selectRelevantVoiceBankEntries } from "./system.js";

beforeEach(() => { resetCounter(); });

describe("selectRelevantVoiceBankEntries", () => {
  it("空のボイスバンクには空配列を返す", () => {
    expect(selectRelevantVoiceBankEntries([], "any")).toEqual([]);
  });

  it("トピック関連エントリを優先する", () => {
    const entries = [
      makeVoiceBankEntry("daily", ["料理"]),
      makeVoiceBankEntry("tech", ["TypeScript"]),
      makeVoiceBankEntry("daily", ["旅行"]),
    ];
    const result = selectRelevantVoiceBankEntries(entries, "TypeScript");
    expect(result[0]!.tweet.topics).toContain("TypeScript");
  });
});

describe("buildSystemPrompt", () => {
  it("tweetモードのシステムプロンプトにpersona.bodyが含まれる", () => {
    const persona = makePersonaDocument();
    const result = buildSystemPrompt(persona, "AI", {
      mode: "tweet",
      maxLength: 280,
      styleHint: null,
    });
    expect(result).toContain("技術好きのエンジニア");
    expect(result).toContain("ボイスバンク参照");
    expect(result).toContain("生成ルール");
    expect(result).toContain("最大280文字");
  });

  it("会話モードでは会話用ルールが追加される", () => {
    const persona = makePersonaDocument();
    const result = buildSystemPrompt(persona, "AI", {
      mode: "converse",
      maxLength: 500,
      styleHint: null,
    });
    expect(result).toContain("会話の流れを自然につなぐ");
    expect(result).toContain("前の発言に反応");
  });

  it("tweetモードには会話用ルールがない", () => {
    const persona = makePersonaDocument();
    const result = buildSystemPrompt(persona, "AI", {
      mode: "tweet",
      maxLength: 280,
      styleHint: null,
    });
    expect(result).not.toContain("会話の流れを自然につなぐ");
  });

  it("styleHintが反映される", () => {
    const persona = makePersonaDocument();
    const result = buildSystemPrompt(persona, "AI", {
      mode: "tweet",
      maxLength: 280,
      styleHint: "皮肉っぽく",
    });
    expect(result).toContain("スタイルヒント: 皮肉っぽく");
  });
});
