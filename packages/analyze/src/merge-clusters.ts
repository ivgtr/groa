import { z } from "zod/v4";
import type {
  ClusterAnalysis,
  AttitudePattern,
  TaggedTweet,
  Category,
} from "@groa/types";
import type { LlmBackend, LlmRequest } from "@groa/llm-client";

const MERGE_MAX_TOKENS = 4096;

const MERGE_PORTRAIT_RESPONSE_SCHEMA = z.object({
  portrait: z.string(),
});

// ---------------------------------------------------------------------------
// プロンプト
// ---------------------------------------------------------------------------

function buildMergePortraitPrompt(
  category: Category,
  analyses: ClusterAnalysis[],
): { system: string; user: string } {
  const totalTweetCount = analyses.reduce(
    (sum, a) => sum + a.tweetCount,
    0,
  );

  const system = `あなたはツイートから抽出された人格特徴を統合する専門家です。
同じカテゴリの複数の分析結果（時系列の異なる期間から抽出されたもの）を1つの統合された人物像に統合してください。

## 出力フォーマット
以下のJSON形式のみを出力してください。JSON以外のテキストは含めないでください。

{
  "portrait": "統合された人物像の記述（500-1500字）"
}

## 制約
- portrait: 500-1500字の自然言語。具体例を交えた行動描写であること
- 各期間の特徴を統合し、一貫した人物像を記述すること
- 時系列の変化がある場合は「〜の傾向が見られるが、近年は〜に移行」のように記述すること
- 各期間に共通する本質的な特徴を中心に据え、時期固有の特徴は補足として扱うこと`;

  const chunks = analyses
    .map(
      (a, i) =>
        `### 期間 ${i + 1}/${analyses.length}（${a.tweetCount}件）\n\n${a.portrait}`,
    )
    .join("\n\n");

  const user = `## 統合対象
カテゴリ: ${category}
総ツイート数: ${totalTweetCount}件
分割数: ${analyses.length}

${chunks}`;

  return { system, user };
}

// ---------------------------------------------------------------------------
// ルールベース統合
// ---------------------------------------------------------------------------

function mergeRepresentativeTweets(
  analyses: ClusterAnalysis[],
): TaggedTweet[] {
  const n = analyses.length;
  const perChunk = Math.max(1, Math.floor(10 / n));
  const result: TaggedTweet[] = [];
  const takenPerChunk: number[] = [];

  // 各チャンクから均等に取得
  for (const a of analyses) {
    const take = Math.min(perChunk, a.representativeTweets.length);
    result.push(...a.representativeTweets.slice(0, take));
    takenPerChunk.push(take);
  }

  // 残り枠を先頭チャンクから順に補充
  if (result.length < 10) {
    for (let i = 0; i < analyses.length; i++) {
      const remaining = analyses[i].representativeTweets.slice(
        takenPerChunk[i],
      );
      for (const tweet of remaining) {
        if (result.length >= 10) break;
        result.push(tweet);
      }
      if (result.length >= 10) break;
    }
  }

  return result.slice(0, 10);
}

/** 全チャンクのパターンをそのまま結合する。意味的な重複統合は synthesize の責務。 */
function mergeAttitudePatterns(
  analyses: ClusterAnalysis[],
): AttitudePattern[] {
  return analyses.flatMap((a) => a.attitudePatterns);
}

// ---------------------------------------------------------------------------
// グルーピング
// ---------------------------------------------------------------------------

export function groupAnalysesByCategory(
  analyses: ClusterAnalysis[],
): { single: ClusterAnalysis[]; toMerge: Map<Category, ClusterAnalysis[]> } {
  const byCategory = new Map<Category, ClusterAnalysis[]>();

  for (const a of analyses) {
    const list = byCategory.get(a.category) ?? [];
    list.push(a);
    byCategory.set(a.category, list);
  }

  const single: ClusterAnalysis[] = [];
  const toMerge = new Map<Category, ClusterAnalysis[]>();

  for (const [category, list] of byCategory) {
    if (list.length === 1) {
      single.push(list[0]);
    } else {
      toMerge.set(category, list);
    }
  }

  return { single, toMerge };
}

// ---------------------------------------------------------------------------
// 同カテゴリ統合
// ---------------------------------------------------------------------------

async function mergeSameCategoryAnalyses(
  analyses: ClusterAnalysis[],
  backend: LlmBackend,
): Promise<ClusterAnalysis> {
  const category = analyses[0].category;
  const tweetCount = analyses.reduce((sum, a) => sum + a.tweetCount, 0);
  const representativeTweets = mergeRepresentativeTweets(analyses);
  const attitudePatterns = mergeAttitudePatterns(analyses);

  // portrait のみ LLM 統合
  const { system, user } = buildMergePortraitPrompt(category, analyses);

  const request: LlmRequest = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: MERGE_MAX_TOKENS,
    options: {
      temperature: 0.0,
      useCache: false,
      useBatch: false,
    },
  };

  let portrait: string;

  try {
    const response = await backend.complete(request);
    const raw: unknown = JSON.parse(response.content);
    const parsed = MERGE_PORTRAIT_RESPONSE_SCHEMA.parse(raw);
    portrait = parsed.portrait;
  } catch {
    // フォールバック: 最後のチャンク（最新時期）の portrait を採用
    console.warn(
      `カテゴリ "${category}" の portrait 統合に失敗しました。最新チャンクの portrait を使用します。`,
    );
    portrait = analyses[analyses.length - 1].portrait;
  }

  return {
    category,
    tweetCount,
    portrait,
    representativeTweets,
    attitudePatterns,
  };
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

/**
 * 同カテゴリの分割 ClusterAnalysis を統合する。
 * 分割なしのカテゴリはそのまま返す。
 */
export async function mergeClusterAnalyses(
  analyses: ClusterAnalysis[],
  backend: LlmBackend,
): Promise<ClusterAnalysis[]> {
  if (analyses.length === 0) return [];

  const { single, toMerge } = groupAnalysesByCategory(analyses);
  const results: ClusterAnalysis[] = [...single];

  for (const [, group] of toMerge) {
    const merged = await mergeSameCategoryAnalyses(group, backend);
    results.push(merged);
  }

  return results;
}
