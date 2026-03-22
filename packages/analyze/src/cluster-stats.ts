import type { TopicCluster } from "@groa/types";
import type { SentenceEnding, TokenEntry } from "@groa/stats";
import {
  getTokenizer,
  extractSentenceEndings,
  extractTopTokens,
} from "@groa/stats";

const TOP_ENDINGS = 5;
const TOP_TOKENS_COUNT = 10;

/** クラスタ固有の StyleStats サブセット */
export interface ClusterStatsSubset {
  sentenceEndings: SentenceEnding[];
  topTokens: TokenEntry[];
}

/** クラスタとその統計サブセットのペア */
export interface ClusterWithStats {
  cluster: TopicCluster;
  stats: ClusterStatsSubset;
}

/**
 * クラスタ内ツイートに限定した StyleStats サブセットを再集計する。
 * - 語尾パターン上位5件
 * - 頻出表現上位10件
 */
export async function computeClusterStats(
  cluster: TopicCluster,
): Promise<ClusterStatsSubset> {
  const tokenizer = await getTokenizer();

  const tokenizedTweets = cluster.tweets.map((tt) => ({
    id: tt.tweet.id,
    tokens: tokenizer.tokenize(tt.tweet.text),
  }));

  const sentenceEndings = extractSentenceEndings(tokenizedTweets).slice(
    0,
    TOP_ENDINGS,
  );
  const topTokens = extractTopTokens(
    tokenizedTweets.map((t) => t.tokens),
  ).slice(0, TOP_TOKENS_COUNT);

  return { sentenceEndings, topTokens };
}

/**
 * 全クラスタの統計サブセットを一括計算する。
 */
export async function computeAllClusterStats(
  clusters: TopicCluster[],
): Promise<ClusterWithStats[]> {
  const results: ClusterWithStats[] = [];

  for (const cluster of clusters) {
    const stats = await computeClusterStats(cluster);
    results.push({ cluster, stats });
  }

  return results;
}
