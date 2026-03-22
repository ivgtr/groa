import { useCallback, useState } from "react";
import { useAppStore } from "../store.ts";
import type { GenerationResult } from "../store.ts";

type GenerateStep = "idle" | "retrieve" | "generate" | "evaluate" | "done";

const STEP_LABELS: Record<GenerateStep, string> = {
  idle: "",
  retrieve: "類似ツイートを検索中...",
  generate: "テキストを生成中...",
  evaluate: "品質を評価中...",
  done: "",
};

function ScoreBadge({ label, score }: { label: string; score: number }) {
  const colorClasses =
    score >= 6.0
      ? "bg-green-100 text-green-800"
      : score >= 4.0
        ? "bg-yellow-100 text-yellow-800"
        : "bg-red-100 text-red-800";

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${colorClasses}`}
    >
      {label}: {score.toFixed(1)}
    </span>
  );
}

function ResultCard({
  result,
  index,
}: {
  result: GenerationResult;
  index: number;
}) {
  const [showIds, setShowIds] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          生成結果 #{index + 1}
        </h3>
        <span className="text-xs text-gray-500">{result.modelUsed}</span>
      </div>

      <div className="rounded-md bg-blue-50 border border-blue-200 p-4">
        <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
          {result.text}
        </p>
      </div>

      {result.evaluation && (
        <>
          <div className="flex flex-wrap gap-2">
            <ScoreBadge
              label="真正性"
              score={result.evaluation.authenticity}
            />
            <ScoreBadge
              label="文体自然度"
              score={result.evaluation.styleNaturalness}
            />
            <ScoreBadge
              label="態度一貫性"
              score={result.evaluation.attitudeConsistency}
            />
          </div>

          <div className="rounded-md bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs font-medium text-gray-500 mb-1">
              評価根拠
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              {result.evaluation.rationale}
            </p>
          </div>
        </>
      )}

      {result.fewShotIds.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowIds(!showIds)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            {showIds ? "Few-shot ツイートIDを閉じる" : `Few-shot ツイートID (${result.fewShotIds.length}件)`}
          </button>
          {showIds && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.fewShotIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-600"
                >
                  {id}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function GenerateView() {
  const {
    setView,
    generationResults,
    isGenerating,
    generateError,
    setGenerationResults,
    setIsGenerating,
    setGenerateError,
  } = useAppStore();

  const [topic, setTopic] = useState("");
  const [numVariants, setNumVariants] = useState(1);
  const [temperature, setTemperature] = useState(0.7);
  const [maxLength, setMaxLength] = useState(280);
  const [styleHint, setStyleHint] = useState("");
  const [currentStep, setCurrentStep] = useState<GenerateStep>("idle");

  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) return;

    setGenerateError(null);
    setGenerationResults([]);
    setIsGenerating(true);

    try {
      setCurrentStep("retrieve");
      await new Promise((resolve) => setTimeout(resolve, 800));

      setCurrentStep("generate");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setCurrentStep("evaluate");
      await new Promise((resolve) => setTimeout(resolve, 700));

      const results: GenerationResult[] = [];
      for (let i = 0; i < numVariants; i++) {
        results.push({
          text: `「${topic.trim()}」について、この人物らしいテキストのサンプル生成結果${i + 1}です。実際のLLM連携後は本物の生成結果が表示されます。`,
          topic: topic.trim(),
          evaluation: {
            authenticity: 7.5 + Math.random() * 2,
            styleNaturalness: 6.0 + Math.random() * 3,
            attitudeConsistency: 7.0 + Math.random() * 2,
            rationale:
              "文体の一貫性が高く、語尾パターンやトピックへの態度が元のツイートと整合的です。",
          },
          fewShotIds: ["t100", "t101", "t102", "t103", "t104"],
          modelUsed: "claude-sonnet-4-6-20250227",
        });
      }

      setGenerationResults(results);
      setCurrentStep("done");
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "生成中にエラーが発生しました",
      );
      setCurrentStep("idle");
    } finally {
      setIsGenerating(false);
    }
  }, [
    topic,
    numVariants,
    setGenerateError,
    setGenerationResults,
    setIsGenerating,
  ]);

  const handleReset = useCallback(() => {
    setGenerationResults([]);
    setGenerateError(null);
    setCurrentStep("idle");
    setTopic("");
  }, [setGenerationResults, setGenerateError]);

  const handleBackToPersona = useCallback(() => {
    setView("persona");
  }, [setView]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">テキスト生成</h2>

      {/* Topic input form */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
        <div>
          <label
            htmlFor="gen-topic"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            トピック
          </label>
          <input
            id="gen-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例: 朝のコーヒー、新しい技術、週末の過ごし方"
            disabled={isGenerating}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="gen-variants"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              生成数
            </label>
            <input
              id="gen-variants"
              type="number"
              min={1}
              max={5}
              value={numVariants}
              onChange={(e) => setNumVariants(Math.max(1, Math.min(5, Number(e.target.value))))}
              disabled={isGenerating}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div>
            <label
              htmlFor="gen-temperature"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Temperature: {temperature.toFixed(1)}
            </label>
            <input
              id="gen-temperature"
              type="range"
              min={0.3}
              max={1.0}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              disabled={isGenerating}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>0.3</span>
              <span>1.0</span>
            </div>
          </div>

          <div>
            <label
              htmlFor="gen-maxlength"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              最大文字数
            </label>
            <input
              id="gen-maxlength"
              type="number"
              min={10}
              max={1000}
              value={maxLength}
              onChange={(e) => setMaxLength(Math.max(10, Math.min(1000, Number(e.target.value))))}
              disabled={isGenerating}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="gen-stylehint"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            スタイルヒント（任意）
          </label>
          <input
            id="gen-stylehint"
            type="text"
            value={styleHint}
            onChange={(e) => setStyleHint(e.target.value)}
            placeholder="例: カジュアルに、丁寧語で、皮肉っぽく"
            disabled={isGenerating}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>

        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={isGenerating || !topic.trim()}
          className="w-full rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isGenerating ? "生成中..." : "生成する"}
        </button>
      </div>

      {/* Progress section */}
      {isGenerating && currentStep !== "idle" && currentStep !== "done" && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <svg
              className="animate-spin h-5 w-5 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm text-gray-700">
              {STEP_LABELS[currentStep]}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            {(["retrieve", "generate", "evaluate"] as const).map((step) => {
              const isActive = step === currentStep;
              const isPast =
                (step === "retrieve" &&
                  (currentStep === "generate" || currentStep === "evaluate")) ||
                (step === "generate" && currentStep === "evaluate");

              return (
                <div
                  key={step}
                  className={`flex-1 h-1.5 rounded-full ${
                    isPast
                      ? "bg-blue-600"
                      : isActive
                        ? "bg-blue-400 animate-pulse"
                        : "bg-gray-200"
                  }`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Error message */}
      {generateError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-800">{generateError}</p>
        </div>
      )}

      {/* Results */}
      {generationResults.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-gray-900">
            生成結果 ({generationResults.length}件)
          </h3>
          {generationResults.map((result, i) => (
            <ResultCard key={i} result={result} index={i} />
          ))}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={handleBackToPersona}
          className="rounded-md bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          ペルソナに戻る
        </button>
        {generationResults.length > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            新しく生成
          </button>
        )}
      </div>
    </div>
  );
}
