import type { PersonaDocument, TaggedTweet, VoiceBankEntry } from "@groa/types";

const VOICE_BANK_MIN = 5;
const VOICE_BANK_MAX = 10;

/**
 * トピックに関連するボイスバンクエントリを優先的に選択する。
 * 最低 VOICE_BANK_MIN、最大 VOICE_BANK_MAX 件を返す。
 */
function selectRelevantVoiceBankEntries(
  voiceBank: VoiceBankEntry[],
  topic: string,
): VoiceBankEntry[] {
  if (voiceBank.length === 0) return [];

  const topicLower = topic.toLowerCase();

  // トピックに関連するエントリを優先
  const relevant: VoiceBankEntry[] = [];
  const rest: VoiceBankEntry[] = [];

  for (const entry of voiceBank) {
    const hasTopicMatch = entry.tweet.topics.some((t) =>
      t.toLowerCase().includes(topicLower) ||
      topicLower.includes(t.toLowerCase()),
    );
    const hasCategoryMatch = entry.tweet.category
      .toLowerCase()
      .includes(topicLower);

    if (hasTopicMatch || hasCategoryMatch) {
      relevant.push(entry);
    } else {
      rest.push(entry);
    }
  }

  const selected = [...relevant];

  // 不足分を残りから補充
  for (const entry of rest) {
    if (selected.length >= VOICE_BANK_MAX) break;
    selected.push(entry);
  }

  return selected.slice(0, VOICE_BANK_MAX).length >= VOICE_BANK_MIN
    ? selected.slice(0, VOICE_BANK_MAX)
    : selected.slice(0, Math.max(selected.length, VOICE_BANK_MIN));
}

/**
 * テキスト生成用のシステムプロンプトとユーザーメッセージを構築する。
 *
 * @param personaDocument ペルソナ文書
 * @param topic 生成トピック/指示
 * @param fewShotTweets Step 6 から取得した類似ツイート
 * @param options 生成オプション
 * @returns system / user プロンプト
 */
export function buildGeneratePrompt(
  personaDocument: PersonaDocument,
  topic: string,
  fewShotTweets: TaggedTweet[],
  options: {
    maxLength: number;
    styleHint: string | null;
  },
): { system: string; user: string } {
  // --- System Prompt ---
  const systemParts: string[] = [];

  // 1. PersonaDocument.body (verbatim)
  systemParts.push(personaDocument.body);

  // 2. Voice bank entries (topic-relevant preferred)
  const selectedVoiceBank = selectRelevantVoiceBankEntries(
    personaDocument.voiceBank,
    topic,
  );

  if (selectedVoiceBank.length > 0) {
    const voiceBankLines = selectedVoiceBank
      .map(
        (vb, i) =>
          `#${i + 1} [${vb.tweet.category}/${vb.tweet.sentiment}] "${vb.tweet.tweet.text}"`,
      )
      .join("\n");

    systemParts.push(`\n## ボイスバンク参照（${selectedVoiceBank.length}件）\n\n${voiceBankLines}`);
  }

  // 3. Generation rules
  const rules: string[] = [];
  rules.push(`- 生成テキストは最大${options.maxLength}文字以内に収めること`);
  rules.push("- 人格に矛盾する発言をしないこと");
  rules.push("- 既存ツイートのコピーではなく、新しいオリジナルの文を生成すること");
  rules.push("- ハッシュタグの乱用を避けること");

  if (options.styleHint) {
    rules.push(`- スタイルヒント: ${options.styleHint}`);
  }

  systemParts.push(`\n## 生成ルール\n\n${rules.join("\n")}`);

  const system = systemParts.join("\n");

  // --- User Message ---
  const userParts: string[] = [];

  userParts.push(`## トピック/指示\n\n${topic}`);

  if (fewShotTweets.length > 0) {
    const fewShotLines = fewShotTweets
      .map(
        (t, i) =>
          `${i + 1}. [${t.category}] "${t.tweet.text}"`,
      )
      .join("\n");

    userParts.push(
      `\n## 参考ツイート（類似テーマの過去発言）\n\n${fewShotLines}`,
    );
  }

  userParts.push(
    "\n## 指示\n\n上記のトピックについて、この人物らしいツイートを1件生成してください。生成したテキストのみを出力してください。",
  );

  const user = userParts.join("\n");

  return { system, user };
}
