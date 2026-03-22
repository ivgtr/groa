import type { StyleStats } from "@groa/types";

interface StyleStatsSectionProps {
  stats: StyleStats;
}

function BarChart({
  items,
  maxValue,
  colorClass,
}: {
  items: { label: string; value: number; displayValue?: string }[];
  maxValue: number;
  colorClass?: string;
}) {
  const color = colorClass ?? "bg-blue-500";
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-20 shrink-0 text-right truncate">
            {item.label}
          </span>
          <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${color} rounded-full transition-all`}
              style={{
                width: `${maxValue > 0 ? (item.value / maxValue) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="text-xs text-gray-500 w-14 shrink-0">
            {item.displayValue ?? String(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function LengthDistribution({ stats }: { stats: StyleStats }) {
  const ld = stats.lengthDistribution;
  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-3">文字数分布</h4>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
        <div className="flex justify-between">
          <span className="text-gray-500">平均</span>
          <span className="font-medium text-gray-900">
            {ld.mean.toFixed(1)}文字
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">中央値</span>
          <span className="font-medium text-gray-900">{ld.median}文字</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">標準偏差</span>
          <span className="font-medium text-gray-900">
            {ld.stdDev.toFixed(1)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">サンプル数</span>
          <span className="font-medium text-gray-900">
            {stats.sampleSize.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="bg-gray-50 rounded-lg p-3">
        <h5 className="text-xs font-medium text-gray-500 mb-2">
          パーセンタイル分布
        </h5>
        <div className="flex items-end gap-1 h-20">
          {(
            [
              { label: "P10", value: ld.percentiles.p10 },
              { label: "P25", value: ld.percentiles.p25 },
              { label: "中央値", value: ld.median },
              { label: "P75", value: ld.percentiles.p75 },
              { label: "P90", value: ld.percentiles.p90 },
            ] as const
          ).map((p) => {
            const maxVal = ld.percentiles.p90;
            const height = maxVal > 0 ? (p.value / maxVal) * 100 : 0;
            return (
              <div
                key={p.label}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <span className="text-[10px] text-gray-500">
                  {p.value}
                </span>
                <div
                  className="w-full bg-blue-400 rounded-t"
                  style={{ height: `${height}%` }}
                />
                <span className="text-[10px] text-gray-400">{p.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CharTypeRatio({ stats }: { stats: StyleStats }) {
  const ratio = stats.charTypeRatio;
  const items: { label: string; value: number; color: string }[] = [
    { label: "ひらがな", value: ratio.hiragana, color: "bg-pink-400" },
    { label: "カタカナ", value: ratio.katakana, color: "bg-purple-400" },
    { label: "漢字", value: ratio.kanji, color: "bg-blue-400" },
    { label: "ASCII", value: ratio.ascii, color: "bg-green-400" },
    { label: "絵文字", value: ratio.emoji, color: "bg-yellow-400" },
  ];

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-3">文字種比率</h4>
      <div className="h-6 flex rounded-full overflow-hidden mb-3">
        {items.map((item) => (
          <div
            key={item.label}
            className={`${item.color} transition-all`}
            style={{ width: `${item.value * 100}%` }}
            title={`${item.label}: ${(item.value * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs">
            <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
            <span className="text-gray-600">
              {item.label} {(item.value * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SentenceEndings({ stats }: { stats: StyleStats }) {
  const endings = stats.sentenceEndings.slice(0, 8);
  const maxFreq = Math.max(...endings.map((e) => e.frequency), 0);
  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-3">文末表現</h4>
      <BarChart
        items={endings.map((e) => ({
          label: e.ending,
          value: e.frequency,
          displayValue: `${(e.frequency * 100).toFixed(1)}%`,
        }))}
        maxValue={maxFreq}
        colorClass="bg-indigo-500"
      />
    </div>
  );
}

function TopTokensAndEmoji({ stats }: { stats: StyleStats }) {
  const tokens = stats.topTokens.slice(0, 8);
  const maxCount = Math.max(...tokens.map((t) => t.count), 0);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">
          頻出トークン
        </h4>
        <BarChart
          items={tokens.map((t) => ({
            label: `${t.token}${t.isNoun ? "" : ""}`,
            value: t.count,
            displayValue: String(t.count),
          }))}
          maxValue={maxCount}
          colorClass="bg-teal-500"
        />
      </div>
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">
          使用絵文字 TOP
        </h4>
        {stats.topEmoji.length > 0 ? (
          <div className="space-y-2">
            {stats.topEmoji.slice(0, 8).map((e) => (
              <div key={e.emoji} className="flex items-center gap-3">
                <span className="text-lg">{e.emoji}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 rounded-full"
                    style={{
                      width: `${stats.topEmoji[0] && stats.topEmoji[0].count > 0 ? (e.count / stats.topEmoji[0].count) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-10">
                  {e.count}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">絵文字の使用なし</p>
        )}
      </div>
    </div>
  );
}

function HourlyDistribution({ stats }: { stats: StyleStats }) {
  const dist = stats.hourlyDistribution;
  const maxVal = Math.max(...dist, 0);
  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-3">
        時間帯別投稿分布
      </h4>
      <div className="flex items-end gap-px h-24">
        {dist.map((count, hour) => {
          const height = maxVal > 0 ? (count / maxVal) * 100 : 0;
          return (
            <div
              key={hour}
              className="flex-1 flex flex-col items-center justify-end"
              title={`${hour}時: ${count}件`}
            >
              <div
                className="w-full bg-blue-400 rounded-t-sm min-h-[2px]"
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-px mt-1">
        {dist.map((_, hour) => (
          <div key={hour} className="flex-1 text-center">
            {hour % 6 === 0 && (
              <span className="text-[10px] text-gray-400">{hour}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OtherStats({ stats }: { stats: StyleStats }) {
  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-3">その他の統計</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">リプライ率</p>
          <p className="text-lg font-semibold text-gray-900">
            {(stats.replyRate * 100).toFixed(1)}%
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">URL共有率</p>
          <p className="text-lg font-semibold text-gray-900">
            {(stats.sharingRate.urlRate * 100).toFixed(1)}%
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">メディア添付率</p>
          <p className="text-lg font-semibold text-gray-900">
            {(stats.sharingRate.mediaRate * 100).toFixed(1)}%
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">改行ありツイート</p>
          <p className="text-lg font-semibold text-gray-900">
            {(stats.lineBreaks.tweetsWithBreaks * 100).toFixed(1)}%
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">平均改行数</p>
          <p className="text-lg font-semibold text-gray-900">
            {stats.lineBreaks.avgBreaksPerTweet.toFixed(1)}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">分析サンプル数</p>
          <p className="text-lg font-semibold text-gray-900">
            {stats.sampleSize.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

export function StyleStatsSection({ stats }: StyleStatsSectionProps) {
  return (
    <section>
      <details>
        <summary className="text-lg font-semibold text-gray-900 mb-4 cursor-pointer select-none">
          文体統計
        </summary>
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-8 mt-4">
          <LengthDistribution stats={stats} />
          <hr className="border-gray-200" />
          <CharTypeRatio stats={stats} />
          <hr className="border-gray-200" />
          <SentenceEndings stats={stats} />
          <hr className="border-gray-200" />
          <TopTokensAndEmoji stats={stats} />
          <hr className="border-gray-200" />
          <HourlyDistribution stats={stats} />
          <hr className="border-gray-200" />
          <OtherStats stats={stats} />
        </div>
      </details>
    </section>
  );
}
