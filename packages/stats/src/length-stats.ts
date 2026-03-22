/**
 * 文字数分布の統計量を算出する。
 */
export interface LengthDistribution {
  mean: number;
  median: number;
  stdDev: number;
  percentiles: {
    p10: number;
    p25: number;
    p75: number;
    p90: number;
  };
}

/**
 * 文字列長の配列から分布統計を計算する。
 * @param lengths 各ツイートの文字数配列
 */
export function calcLengthDistribution(lengths: number[]): LengthDistribution {
  if (lengths.length === 0) {
    return {
      mean: 0,
      median: 0,
      stdDev: 0,
      percentiles: { p10: 0, p25: 0, p75: 0, p90: 0 },
    };
  }

  const sorted = [...lengths].sort((a, b) => a - b);
  const n = sorted.length;

  const mean = sorted.reduce((sum, v) => sum + v, 0) / n;
  const median = percentile(sorted, 50);
  const variance =
    sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  return {
    mean: round(mean),
    median: round(median),
    stdDev: round(stdDev),
    percentiles: {
      p10: round(percentile(sorted, 10)),
      p25: round(percentile(sorted, 25)),
      p75: round(percentile(sorted, 75)),
      p90: round(percentile(sorted, 90)),
    },
  };
}

/**
 * ソート済み配列からパーセンタイル値を算出する（線形補間）。
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  const fraction = index - lower;
  return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
}

function round(n: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
