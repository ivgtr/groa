import type { TaggedTweet, SessionMode, SessionTurn } from "@groa/types";

const MAX_HISTORY_TURNS = 6;

/**
 * 会話履歴をコンテキスト転写用テキストに変換する。
 * 直近 MAX_HISTORY_TURNS ターンに制限。
 */
function formatHistory(
  turns: SessionTurn[],
  mode: SessionMode,
): string | null {
  if (turns.length === 0) return null;

  const recent = turns.slice(-MAX_HISTORY_TURNS);

  if (mode === "multi") {
    return recent
      .map((t) => `[${t.speakerId}]: ${t.text}`)
      .join("\n");
  }

  if (mode === "chat") {
    return recent
      .map((t) => {
        const label = t.speakerId === "__user__" ? "ユーザー" : t.speakerId;
        return `[${label}]: ${t.text}`;
      })
      .join("\n");
  }

  // converse: 単一話者の連続発言
  return recent.map((t) => t.text).join("\n\n");
}

/** few-shotツイートをフォーマットする */
function formatFewShots(fewShotTweets: TaggedTweet[]): string | null {
  if (fewShotTweets.length === 0) return null;

  return fewShotTweets
    .map((t, i) => `${i + 1}. [${t.category}] "${t.tweet.text}"`)
    .join("\n");
}

/** モード別の生成指示文 */
function buildInstruction(
  mode: SessionMode,
  speakerName?: string,
): string {
  switch (mode) {
    case "tweet":
      return "上記のトピックについて、この人物らしいツイートを1件生成してください。生成したテキストのみを出力してください。";
    case "converse":
      return "上記の流れを踏まえ、この人物らしい次の発言を生成してください。生成したテキストのみを出力してください。";
    case "multi":
      return `上記の会話の続きとして、${speakerName ?? "この人物"}として次の発言をしてください。生成したテキストのみを出力してください。`;
    case "chat":
      return "上記の会話の続きとして、この人物らしい応答を生成してください。生成したテキストのみを出力してください。";
  }
}

/**
 * セッション用ユーザーメッセージを構築する。
 * topic + 会話履歴 + few-shot + 生成指示で構成。
 */
export function buildTurnPrompt(
  topic: string,
  fewShotTweets: TaggedTweet[],
  options: {
    mode: SessionMode;
    history: SessionTurn[];
    speakerName?: string;
  },
): string {
  const parts: string[] = [];

  // 1. 会話履歴（converse/multi/chatのみ）
  if (options.mode !== "tweet") {
    const historyText = formatHistory(options.history, options.mode);
    if (historyText) {
      parts.push(`## これまでの会話\n\n${historyText}`);
    }
  }

  // 2. トピック
  const topicPrefix = parts.length > 0 ? "\n" : "";
  parts.push(`${topicPrefix}## トピック/指示\n\n${topic}`);

  // 3. few-shot ツイート
  const fewShotText = formatFewShots(fewShotTweets);
  if (fewShotText) {
    parts.push(
      `\n## 参考ツイート（類似テーマの過去発言）\n\n${fewShotText}`,
    );
  }

  // 4. 生成指示
  const instruction = buildInstruction(options.mode, options.speakerName);
  parts.push(`\n## 指示\n\n${instruction}`);

  return parts.join("\n");
}
