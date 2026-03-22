import type { BuildStep } from "../store.ts";
import { useAppStore } from "../store.ts";

const STEP_LABELS: Record<string, string> = {
  preprocess: "前処理",
  stats: "文体分析",
  classify: "分類",
  analyze: "クラスタ分析",
  synthesize: "ペルソナ合成",
  embed: "Embedding生成",
};

function StepStatusIcon({ status }: { status: BuildStep["status"] }) {
  switch (status) {
    case "pending":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-300">
          <span className="h-2 w-2 rounded-full bg-gray-300" />
        </span>
      );
    case "running":
      return (
        <span className="flex h-6 w-6 items-center justify-center">
          <svg
            className="h-6 w-6 animate-spin text-blue-500"
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
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </span>
      );
    case "done":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500">
          <svg
            className="h-4 w-4 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </span>
      );
    case "error":
      return (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500">
          <svg
            className="h-4 w-4 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </span>
      );
  }
}

function StepRow({ step }: { step: BuildStep }) {
  const label = STEP_LABELS[step.name] ?? step.name;
  const isActive = step.status === "running";

  return (
    <div
      className={`flex items-center justify-between rounded-md px-4 py-3 ${
        isActive ? "bg-blue-50 ring-1 ring-blue-200" : "bg-white"
      }`}
    >
      <div className="flex items-center gap-3">
        <StepStatusIcon status={step.status} />
        <span
          className={`text-sm font-medium ${
            isActive
              ? "text-blue-700"
              : step.status === "done"
                ? "text-gray-700"
                : step.status === "error"
                  ? "text-red-700"
                  : "text-gray-400"
          }`}
        >
          {label}
        </span>
      </div>
      {step.status === "done" && step.costUsd > 0 && (
        <span className="text-xs text-gray-500">
          ${step.costUsd.toFixed(2)}
        </span>
      )}
    </div>
  );
}

export function BuildProgress() {
  const { buildSteps, buildError, totalCostUsd } = useAppStore();

  const allDone = buildSteps.length > 0 && buildSteps.every((s) => s.status === "done");
  const hasError = buildSteps.some((s) => s.status === "error");

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">ビルド進捗</h3>

      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
        {buildSteps.map((step) => (
          <StepRow key={step.name} step={step} />
        ))}
      </div>

      {buildError && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4">
          <p className="text-sm text-red-700">{buildError}</p>
        </div>
      )}

      {(allDone || hasError) && totalCostUsd > 0 && (
        <div className="flex justify-end">
          <span className="text-sm text-gray-600">
            合計コスト: <span className="font-medium">${totalCostUsd.toFixed(2)}</span>
          </span>
        </div>
      )}

      {allDone && (
        <div className="rounded-md border border-green-300 bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-medium text-green-800">
              ビルドが完了しました
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
