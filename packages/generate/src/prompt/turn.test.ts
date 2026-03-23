import { describe, it, expect, beforeEach } from "vitest";
import type { SessionTurn } from "@groa/types";
import { Timestamp, ModelIdString } from "@groa/types";
import { resetCounter, makeTaggedTweet } from "../test-helpers.js";
import { buildTurnPrompt } from "./turn.js";

function makeTurn(speakerId: string, text: string, index: number): SessionTurn {
  return {
    index,
    speakerId,
    text,
    fewShotIds: [],
    modelUsed: ModelIdString("test-model"),
    timestamp: Timestamp(Date.now() + index),
  };
}

beforeEach(() => { resetCounter(); });

describe("buildTurnPrompt - tweetモード", () => {
  it("historyを含まず、1件生成指示を出す", () => {
    const fewShots = [makeTaggedTweet("tech"), makeTaggedTweet("daily")];
    const result = buildTurnPrompt("AIの未来", fewShots, {
      mode: "tweet",
      history: [],
    });
    expect(result).toContain("AIの未来");
    expect(result).toContain("参考ツイート");
    expect(result).toContain("ツイートを1件生成");
    expect(result).not.toContain("これまでの会話");
  });

  it("historyがあってもtweetモードでは無視される", () => {
    const history = [makeTurn("alice", "こんにちは", 0)];
    const result = buildTurnPrompt("AI", [], {
      mode: "tweet",
      history,
    });
    expect(result).not.toContain("これまでの会話");
  });
});

describe("buildTurnPrompt - converseモード", () => {
  it("historyが含まれる", () => {
    const history = [
      makeTurn("alice", "AIは面白い", 0),
      makeTurn("alice", "特にLLMが", 1),
    ];
    const result = buildTurnPrompt("AI", [], {
      mode: "converse",
      history,
    });
    expect(result).toContain("これまでの会話");
    expect(result).toContain("AIは面白い");
    expect(result).toContain("特にLLMが");
    expect(result).toContain("次の発言を生成");
  });
});

describe("buildTurnPrompt - multiモード", () => {
  it("話者名付きのhistoryが含まれる", () => {
    const history = [
      makeTurn("alice", "AIは便利だ", 0),
      makeTurn("bob", "リスクもある", 1),
    ];
    const result = buildTurnPrompt("AI", [], {
      mode: "multi",
      history,
      speakerName: "alice",
    });
    expect(result).toContain("[alice]: AIは便利だ");
    expect(result).toContain("[bob]: リスクもある");
    expect(result).toContain("aliceとして次の発言");
  });
});

describe("buildTurnPrompt - chatモード", () => {
  it("ユーザー発言が適切にラベル付けされる", () => {
    const history = [
      makeTurn("__user__", "こんにちは", 0),
      makeTurn("alice", "こんにちは！", 1),
    ];
    const result = buildTurnPrompt("雑談", [], {
      mode: "chat",
      history,
    });
    expect(result).toContain("[ユーザー]: こんにちは");
    expect(result).toContain("[alice]: こんにちは！");
    expect(result).toContain("応答を生成");
  });
});

describe("buildTurnPrompt - history上限", () => {
  it("直近6ターンに制限される", () => {
    const history: SessionTurn[] = [];
    for (let i = 0; i < 10; i++) {
      history.push(makeTurn("alice", `ターン${i}`, i));
    }
    const result = buildTurnPrompt("AI", [], {
      mode: "converse",
      history,
    });
    expect(result).not.toContain("ターン0");
    expect(result).not.toContain("ターン3");
    expect(result).toContain("ターン4");
    expect(result).toContain("ターン9");
  });
});
