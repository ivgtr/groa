import type {
  ClusterAnalysis,
  StyleStats,
  VoiceBankEntry,
} from "@groa/types";

const SYSTEM_PROMPT = `あなたはツイート分析データから人格ペルソナ文書を合成する専門家です。
与えられたクラスタ分析結果・文体統計・ボイスバンクから、LLMのシステムプロンプトとして直接使用可能なペルソナ文書を生成してください。

## ペルソナ本文 (body) の構成

以下の6セクション構成で、Markdown形式の自然言語文書を生成してください（合計3000-6000字）:

1. **人物像サマリ**（1-2段落）: この人物の全体像を簡潔に描写
2. **文体ルール**（具体例付き）: 「〜のように書く」「〜とは書かない」の形式で明示。統計データの人間可読な変換を含む
3. **トピック別モード記述**: 技術/日常/意見等、各モードごとの態度・トーン
4. **思考の癖**: 論理展開パターン、好む比喩、ユーモアの種類
5. **感情表現の特徴**: 頻度、引き金、表現の幅
6. **語彙の特徴**: 口癖、好む表現、避ける表現

## 品質基準
- 「〜な傾向がある」のような抽象記述には必ず具体例を併記すること
- ボイスバンクのツイートを参照し「例えばボイスバンク#Nのように」の形で実例を紐づけること
- 文体ルールセクションでは統計データの確定的数値を人間可読な記述に変換すること

## 態度パターンの統合
各クラスタから抽出された態度パターンの中で重複・類似するものを統合し、モード共通/モード固有を区別してください。

## 矛盾の検出
モード依存の振る舞い（「技術の話では断定的だが日常では曖昧」等）は矛盾として解消せず保持してください。
本質的な矛盾（同一モード内の不整合等）のみ解消し、contradictionsに記録してください。

## 出力フォーマット
以下のJSON形式のみを出力してください。JSON以外のテキストは含めないでください。

{
  "body": "Markdown形式のペルソナ本文（3000-6000字）",
  "attitudePatterns": [
    {
      "name": "パターン名",
      "description": "統合後の説明",
      "exampleTweetIds": ["実例ID"],
      "sourceCategories": ["tech", "daily"]
    }
  ],
  "contradictions": ["検出した矛盾の記述"]
}`;

/**
 * ペルソナ合成プロンプトを構築する。
 */
export function buildSynthesizePrompt(
  analyses: ClusterAnalysis[],
  styleStats: StyleStats,
  voiceBank: VoiceBankEntry[],
): { system: string; user: string } {
  const clusterSection = analyses
    .map(
      (a) =>
        `### ${a.category}カテゴリ（${a.tweetCount}件）\n\n${a.portrait}`,
    )
    .join("\n\n");

  const statsSection = formatStyleStats(styleStats);

  const voiceBankSection = voiceBank
    .map(
      (vb, i) =>
        `#${i + 1} [${vb.tweet.category}/${vb.tweet.sentiment}] "${vb.tweet.tweet.text}" (ID: ${vb.tweet.tweet.id})`,
    )
    .join("\n");

  const patternsSection = analyses
    .flatMap((a) =>
      a.attitudePatterns.map(
        (p) => `- [${a.category}] ${p.name}: ${p.description}`,
      ),
    )
    .join("\n");

  const user = `## クラスタ分析結果

${clusterSection}

## 文体統計（全体）

${statsSection}

## ボイスバンク（${voiceBank.length}件）

${voiceBankSection}

## 態度パターン一覧（統合前）

${patternsSection}`;

  return { system: SYSTEM_PROMPT, user };
}

/** StyleStats を人間可読なテキストに変換する */
function formatStyleStats(stats: StyleStats): string {
  const lines: string[] = [];

  // 文長分布
  const ld = stats.lengthDistribution;
  lines.push(
    `文長: 平均${ld.mean.toFixed(0)}字, 中央値${ld.median.toFixed(0)}字 (P10=${ld.percentiles.p10.toFixed(0)}, P90=${ld.percentiles.p90.toFixed(0)})`,
  );

  // 文字種比率
  const cr = stats.charTypeRatio;
  lines.push(
    `文字種比率: ひらがな${(cr.hiragana * 100).toFixed(0)}%, カタカナ${(cr.katakana * 100).toFixed(0)}%, 漢字${(cr.kanji * 100).toFixed(0)}%, ASCII${(cr.ascii * 100).toFixed(0)}%, 絵文字${(cr.emoji * 100).toFixed(0)}%`,
  );

  // 語尾パターン
  if (stats.sentenceEndings.length > 0) {
    const endings = stats.sentenceEndings
      .slice(0, 5)
      .map((e) => `"${e.ending}"(${e.frequency}件)`)
      .join(", ");
    lines.push(`主な語尾: ${endings}`);
  }

  // 頻出語彙
  if (stats.topTokens.length > 0) {
    const tokens = stats.topTokens
      .slice(0, 10)
      .map((t) => `"${t.token}"(${t.count})`)
      .join(", ");
    lines.push(`頻出語彙: ${tokens}`);
  }

  // 絵文字
  if (stats.topEmoji.length > 0) {
    const emojis = stats.topEmoji
      .slice(0, 5)
      .map((e) => `${e.emoji}(${e.count})`)
      .join(", ");
    lines.push(`頻出絵文字: ${emojis}`);
  }

  // 構造
  lines.push(`改行ツイート率: ${(stats.lineBreaks.tweetsWithBreaks * 100).toFixed(0)}%`);
  lines.push(`URL共有率: ${(stats.sharingRate.urlRate * 100).toFixed(0)}%`);
  lines.push(`リプライ率: ${(stats.replyRate * 100).toFixed(0)}%`);
  lines.push(`分析対象: ${stats.sampleSize}件`);

  return lines.join("\n");
}

export { SYSTEM_PROMPT as SYNTHESIZE_SYSTEM_PROMPT };
