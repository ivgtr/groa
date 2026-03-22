import { useCallback, useMemo, useState } from "react";
import { useAppStore } from "../store.ts";
import {
  convertTweets,
  buildDefinition,
  TWINT_DEFINITION,
  TWITTER_ARCHIVE_DEFINITION,
} from "@groa/convert";
import type { ConverterDefinition } from "@groa/convert";

/** groa の必須フィールド定義 */
const GROA_FIELDS = [
  { key: "id", label: "ID", required: true },
  { key: "text", label: "テキスト", required: true },
  { key: "timestamp", label: "タイムスタンプ", required: true },
  { key: "isRetweet", label: "リツイート", required: false },
  { key: "hasMedia", label: "メディア", required: false },
  { key: "replyTo", label: "リプライ先", required: false },
] as const;

type GroaFieldKey = (typeof GROA_FIELDS)[number]["key"];

/** 組み込みプリセット */
const PRESETS: { name: string; label: string; definition: ConverterDefinition }[] = [
  { name: "twint", label: "Twint / snscrape", definition: TWINT_DEFINITION },
  { name: "twitter-archive", label: "Twitter/X 公式エクスポート", definition: TWITTER_ARCHIVE_DEFINITION },
];

export function FormatMappingPanel() {
  const { rawData, detectedFormat, setTweets, setUploadError, clearRawData } =
    useAppStore();

  // プリセット選択 or カスタム
  const [mode, setMode] = useState<"preset" | "custom">(() => {
    if (detectedFormat?.formatName) return "preset";
    return "custom";
  });
  const [selectedPreset, setSelectedPreset] = useState<string>(
    detectedFormat?.formatName ?? PRESETS[0]?.name ?? "",
  );

  // カスタムマッピング: groa field → source key
  const [customMapping, setCustomMapping] = useState<Record<GroaFieldKey, string>>(() => {
    const keys = detectedFormat?.detectedKeys ?? [];
    return {
      id: keys.includes("id") ? "id" : "",
      text: keys.includes("text") ? "text" : keys.includes("tweet") ? "tweet" : "",
      timestamp: keys.includes("timestamp") ? "timestamp" : keys.includes("created_at") ? "created_at" : "",
      isRetweet: keys.includes("isRetweet") ? "isRetweet" : keys.includes("retweet") ? "retweet" : "",
      hasMedia: keys.includes("hasMedia") ? "hasMedia" : keys.includes("photos") ? "photos" : "",
      replyTo: keys.includes("replyTo") ? "replyTo" : "",
    };
  });

  const [convertError, setConvertError] = useState<string | null>(null);

  const detectedKeys = useMemo(
    () => detectedFormat?.detectedKeys ?? [],
    [detectedFormat],
  );

  const handleConvert = useCallback(() => {
    if (!rawData) return;
    setConvertError(null);

    try {
      let definition: ConverterDefinition;

      if (mode === "preset") {
        const preset = PRESETS.find((p) => p.name === selectedPreset);
        if (!preset) {
          setConvertError("プリセットが見つかりません。");
          return;
        }
        definition = preset.definition;
      } else {
        // カスタムマッピング: 必須フィールドチェック
        if (!customMapping.id || !customMapping.text || !customMapping.timestamp) {
          setConvertError("ID、テキスト、タイムスタンプは必須です。");
          return;
        }
        definition = buildDefinition({
          id: customMapping.id || undefined,
          text: customMapping.text || undefined,
          timestamp: customMapping.timestamp || undefined,
          isRetweet: customMapping.isRetweet || undefined,
          hasMedia: customMapping.hasMedia || undefined,
          replyTo: customMapping.replyTo || undefined,
        });
      }

      const result = convertTweets(rawData, definition);

      if (result.skippedCount > 0) {
        const preview = result.warnings.slice(0, 3).join("\n");
        const more = result.warnings.length > 3
          ? `\n...他${String(result.warnings.length - 3)}件`
          : "";
        setConvertError(
          `${String(result.skippedCount)}件の変換をスキップしました（${String(result.convertedCount)}/${String(result.totalCount)}件成功）\n${preview}${more}`,
        );
        if (result.convertedCount === 0) return;
      }

      setTweets(result.tweets, result.tweets.length);
    } catch (error) {
      setConvertError(
        error instanceof Error ? error.message : "変換に失敗しました。",
      );
    }
  }, [rawData, mode, selectedPreset, customMapping, setTweets]);

  if (!rawData || !detectedFormat) return null;

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">
        フォーマット変換
      </h2>

      <div className="rounded-md border border-blue-300 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          {detectedFormat.formatName
            ? `「${detectedFormat.formatName}」形式を検出しました（${String(rawData.length)}件）`
            : `未知のフォーマットです（${String(rawData.length)}件、${String(detectedKeys.length)}フィールド）`}
        </p>
        <p className="mt-1 text-xs text-blue-600">
          検出キー: {detectedKeys.slice(0, 8).join(", ")}
          {detectedKeys.length > 8 && ` ...他${String(detectedKeys.length - 8)}件`}
        </p>
      </div>

      {/* モード選択 */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="convert-mode"
            checked={mode === "preset"}
            onChange={() => setMode("preset")}
            className="text-blue-600"
          />
          プリセット
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="convert-mode"
            checked={mode === "custom"}
            onChange={() => setMode("custom")}
            className="text-blue-600"
          />
          カスタムマッピング
        </label>
      </div>

      {/* プリセット選択 */}
      {mode === "preset" && (
        <div>
          <label htmlFor="preset-select" className="block text-sm font-medium text-gray-700 mb-1">
            プリセット
          </label>
          <select
            id="preset-select"
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* カスタムマッピングフォーム */}
      {mode === "custom" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            各フィールドに対応する外部JSONのキーを選択してください。
          </p>
          {GROA_FIELDS.map((field) => (
            <div key={field.key} className="flex items-center gap-3">
              <label
                htmlFor={`map-${field.key}`}
                className="w-32 text-sm font-medium text-gray-700"
              >
                {field.label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              <select
                id={`map-${field.key}`}
                value={customMapping[field.key]}
                onChange={(e) =>
                  setCustomMapping((prev) => ({
                    ...prev,
                    [field.key]: e.target.value,
                  }))
                }
                className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">
                  {field.required ? "-- 選択してください --" : "-- なし --"}
                </option>
                {detectedKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* エラー表示 */}
      {convertError && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-800 whitespace-pre-wrap">
            {convertError}
          </p>
        </div>
      )}

      {/* アクションボタン */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleConvert}
          className="flex-1 rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          変換して続行
        </button>
        <button
          type="button"
          onClick={() => {
            clearRawData();
            setUploadError(null);
          }}
          className="rounded-md border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          戻る
        </button>
      </div>
    </section>
  );
}
