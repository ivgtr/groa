import type { PersonaDocument, SessionMode, VoiceBankEntry } from "@groa/types";

const VOICE_BANK_MIN = 5;
const VOICE_BANK_MAX = 10;

/**
 * トピックに関連するボイスバンクエントリを優先的に選択する。
 */
export function selectRelevantVoiceBankEntries(
  voiceBank: VoiceBankEntry[],
  topic: string,
): VoiceBankEntry[] {
  if (voiceBank.length === 0) return [];

  const topicLower = topic.toLowerCase();

  const relevant: VoiceBankEntry[] = [];
  const rest: VoiceBankEntry[] = [];

  for (const entry of voiceBank) {
    const hasTopicMatch = entry.tweet.topics.some(
      (t) =>
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

  for (const entry of rest) {
    if (selected.length >= VOICE_BANK_MAX) break;
    selected.push(entry);
  }

  // MAX件を超えないよう切り詰め、MIN未満でも全件返す
  return selected.slice(0, VOICE_BANK_MAX);
}

/** モード別の生成ルール */
function buildModeRules(
  mode: SessionMode,
  maxLength: number,
  styleHint: string | null,
): string[] {
  const rules: string[] = [];
  rules.push(`- 生成テキストは最大${maxLength}文字以内に収めること`);
  rules.push("- 人格に矛盾する発言をしないこと");
  rules.push(
    "- 既存ツイートのコピーではなく、新しいオリジナルの文を生成すること",
  );
  rules.push("- ハッシュタグの乱用を避けること");

  if (mode === "converse" || mode === "multi" || mode === "chat") {
    rules.push("- 会話の流れを自然につなぐこと");
    rules.push("- 前の発言に反応してから自分の意見を述べること");
  }

  if (styleHint) {
    rules.push(`- スタイルヒント: ${styleHint}`);
  }

  return rules;
}

/**
 * セッション用システムプロンプトを構築する。
 * PersonaDocument.body + ボイスバンク + モード別ルールで構成。
 */
export function buildSystemPrompt(
  persona: PersonaDocument,
  topic: string,
  options: {
    mode: SessionMode;
    maxLength: number;
    styleHint: string | null;
  },
): string {
  const parts: string[] = [];

  // 1. PersonaDocument.body
  parts.push(persona.body);

  // 2. Voice bank entries
  const selectedVoiceBank = selectRelevantVoiceBankEntries(
    persona.voiceBank,
    topic,
  );

  if (selectedVoiceBank.length > 0) {
    const voiceBankLines = selectedVoiceBank
      .map(
        (vb, i) =>
          `#${i + 1} [${vb.tweet.category}/${vb.tweet.sentiment}] "${vb.tweet.tweet.text}"`,
      )
      .join("\n");

    parts.push(
      `\n## ボイスバンク参照（${selectedVoiceBank.length}件）\n\n${voiceBankLines}`,
    );
  }

  // 3. Mode-specific rules
  const rules = buildModeRules(options.mode, options.maxLength, options.styleHint);
  parts.push(`\n## 生成ルール\n\n${rules.join("\n")}`);

  return parts.join("\n");
}
