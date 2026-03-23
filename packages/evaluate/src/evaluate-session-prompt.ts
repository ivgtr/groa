import type {
  Session,
  PersonaDocument,
  TaggedTweet,
  VoiceBankEntry,
} from "@groa/types";

const VOICE_BANK_MAX = 5;

const TWEET_SYSTEM_PROMPT =
  "あなたは文体分析の専門家です。以下の「参照ツイート群」と「評価対象テキスト」が同一人物によって書かれたものかどうかを評価してください。";

const CONVERSATION_SYSTEM_PROMPT =
  "あなたは会話品質評価の専門家です。以下の「参照ツイート群」と「評価対象の会話」を比較し、会話内の発言がその人物らしいかどうかを評価してください。";

function formatVoiceBank(voiceBank: VoiceBankEntry[]): string {
  return voiceBank
    .slice(0, VOICE_BANK_MAX)
    .map(
      (vb, i) =>
        `${i + 1}. [${vb.tweet.category}/${vb.tweet.sentiment}] "${vb.tweet.tweet.text}"`,
    )
    .join("\n");
}

function formatReferenceTweets(tweets: TaggedTweet[]): string {
  return tweets.map((t, i) => `${i + 1}. ${t.tweet.text}`).join("\n");
}

/**
 * tweetモード用の評価プロンプトを構築する。
 */
function buildTweetEvalPrompt(
  session: Session,
  evaluationTweets: TaggedTweet[],
  persona: PersonaDocument,
): { system: string; user: string } {
  const turn = session.turns[0];
  if (!turn) {
    throw new Error("tweetモードのセッションにturnsが存在しません");
  }
  const text = turn.text;

  const user = `## 参照ツイート群（この人物の実際のツイート）
${formatReferenceTweets(evaluationTweets)}

## ボイスバンク（この人物の代表的なツイート）
${formatVoiceBank(persona.voiceBank)}

## 評価対象テキスト
${text}

## 評価基準
1. authenticity: 同一人物が書いたように読めるか (0-10)
2. coherence: 文体が自然か、わざとらしくないか (0-10)
3. consistency: このトピックに対するこの人の態度として妥当か (0-10)
4. rationale: 上記スコアの根拠を具体的に述べよ

以下のJSON形式で回答してください:
{
  "authenticity": <number 0-10>,
  "coherence": <number 0-10>,
  "consistency": <number 0-10>,
  "rationale": "<string>"
}`;

  return { system: TWEET_SYSTEM_PROMPT, user };
}

/**
 * 会話モード用の評価プロンプトを構築する。
 */
function buildConversationEvalPrompt(
  session: Session,
  evaluationTweets: TaggedTweet[],
  persona: PersonaDocument,
): { system: string; user: string } {
  const conversationLines = session.turns
    .map((t) => {
      const label = t.speakerId === "__user__" ? "ユーザー" : t.speakerId;
      return `[${label}]: ${t.text}`;
    })
    .join("\n");

  const user = `## 参照ツイート群（この人物の実際のツイート）
${formatReferenceTweets(evaluationTweets)}

## ボイスバンク（この人物の代表的なツイート）
${formatVoiceBank(persona.voiceBank)}

## 評価対象の会話
${conversationLines}

## 評価基準
1. authenticity: 各ターンがキャラクターらしいか（平均） (0-10)
2. coherence: 前の発言を踏まえた文脈的一貫性 (0-10)
3. consistency: 会話全体の流れの自然さ (0-10)
4. rationale: 上記スコアの根拠を具体的に述べよ

以下のJSON形式で回答してください:
{
  "authenticity": <number 0-10>,
  "coherence": <number 0-10>,
  "consistency": <number 0-10>,
  "rationale": "<string>"
}`;

  return { system: CONVERSATION_SYSTEM_PROMPT, user };
}

/**
 * セッション評価プロンプトを構築する。
 * tweetモードと会話モードで異なるプロンプトを生成する。
 */
export function buildSessionEvalPrompt(
  session: Session,
  evaluationTweets: TaggedTweet[],
  persona: PersonaDocument,
): { system: string; user: string } {
  if (session.mode === "tweet") {
    return buildTweetEvalPrompt(session, evaluationTweets, persona);
  }
  return buildConversationEvalPrompt(session, evaluationTweets, persona);
}
