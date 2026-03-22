import type {
  PersonaDocument,
  TaggedTweet,
  GeneratedText,
  VoiceBankEntry,
} from "@groa/types";

const SYSTEM_PROMPT =
  "あなたは文体分析の専門家です。以下の「参照ツイート群」と「評価対象テキスト」が同一人物によって書かれたものかどうかを評価してください。";

const VOICE_BANK_MAX = 5;

/**
 * 品質評価プロンプトを構築する。
 *
 * @param generatedText 評価対象の生成テキスト
 * @param evaluationTweets 評価用の参照ツイート群（5-10件）
 * @param personaDocument ペルソナ文書
 * @returns system / user プロンプト
 */
export function buildEvaluatePrompt(
  generatedText: GeneratedText,
  evaluationTweets: TaggedTweet[],
  personaDocument: PersonaDocument,
): { system: string; user: string } {
  // 参照ツイート群（リスト形式）
  const tweetLines = evaluationTweets
    .map((t, i) => `${i + 1}. ${t.tweet.text}`)
    .join("\n");

  // ボイスバンクから最大5件を取得
  const selectedVoiceBank = personaDocument.voiceBank.slice(0, VOICE_BANK_MAX);
  const voiceBankLines = selectedVoiceBank
    .map(
      (vb: VoiceBankEntry, i: number) =>
        `${i + 1}. [${vb.tweet.category}/${vb.tweet.sentiment}] "${vb.tweet.tweet.text}"`,
    )
    .join("\n");

  const user = `## 参照ツイート群（この人物の実際のツイート）
${tweetLines}

## ボイスバンク（この人物の代表的なツイート）
${voiceBankLines}

## 評価対象テキスト
${generatedText.text}

## 評価基準
1. authenticity: 同一人物が書いたように読めるか (0-10)
2. styleNaturalness: 文体が自然か、わざとらしくないか (0-10)
3. attitudeConsistency: このトピックに対するこの人の態度として妥当か (0-10)
4. rationale: 上記スコアの根拠を具体的に述べよ

以下のJSON形式で回答してください:
{
  "authenticity": <number 0-10>,
  "styleNaturalness": <number 0-10>,
  "attitudeConsistency": <number 0-10>,
  "rationale": "<string>"
}`;

  return { system: SYSTEM_PROMPT, user };
}

export { SYSTEM_PROMPT as EVALUATE_SYSTEM_PROMPT };
