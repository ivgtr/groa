import type { VoiceBankEntry } from "@groa/types";

const CATEGORY_LABELS: Record<string, string> = {
  tech: "技術",
  daily: "日常",
  opinion: "意見",
  emotion: "感情",
  creative: "創作",
  other: "その他",
};

const SENTIMENT_LABELS: Record<string, string> = {
  positive: "ポジティブ",
  negative: "ネガティブ",
  neutral: "ニュートラル",
  mixed: "ミックス",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "bg-green-100 text-green-800",
  negative: "bg-red-100 text-red-800",
  neutral: "bg-gray-100 text-gray-800",
  mixed: "bg-yellow-100 text-yellow-800",
};

interface VoiceBankSectionProps {
  entries: VoiceBankEntry[];
}

export function VoiceBankSection({ entries }: VoiceBankSectionProps) {
  return (
    <section>
      <details open>
        <summary className="text-lg font-semibold text-gray-900 mb-4 cursor-pointer select-none">
          ボイスバンク ({entries.length}件)
        </summary>
        <div className="space-y-3 mt-4">
          {entries.map((entry, i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-gray-200 p-4"
            >
              <p className="text-sm text-gray-800 mb-3 leading-relaxed">
                {entry.tweet.tweet.text}
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                  {CATEGORY_LABELS[entry.tweet.category] ??
                    entry.tweet.category}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SENTIMENT_COLORS[entry.tweet.sentiment] ?? "bg-gray-100 text-gray-800"}`}
                >
                  {SENTIMENT_LABELS[entry.tweet.sentiment] ??
                    entry.tweet.sentiment}
                </span>
                {entry.tweet.topics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
                  >
                    {topic}
                  </span>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-2">
                <p className="text-xs text-gray-500">
                  <span className="font-medium">選定理由:</span>{" "}
                  {entry.selectionReason}
                </p>
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
