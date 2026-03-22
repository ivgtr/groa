import { useCallback } from "react";
import { useAppStore } from "../store.ts";
import { FileUpload, FileUploadResult } from "./FileUpload.tsx";
import { BuildProgress } from "./BuildProgress.tsx";

const BUILD_STEP_NAMES = [
  "preprocess",
  "stats",
  "classify",
  "analyze",
  "synthesize",
  "embed",
] as const;

const SIMULATED_COSTS: Record<string, number> = {
  preprocess: 0,
  stats: 0,
  classify: 0.17,
  analyze: 1.5,
  synthesize: 0.5,
  embed: 0,
};

const STEP_DELAY_MS = 500;

export function BuildPanel() {
  const {
    tweets,
    isBuilding,
    buildSteps,
    setView,
    setBuildSteps,
    updateBuildStep,
    setBuildError,
    setTotalCostUsd,
    setIsBuilding,
  } = useAppStore();

  const allDone =
    buildSteps.length > 0 && buildSteps.every((s) => s.status === "done");

  const startBuild = useCallback(async () => {
    const initialSteps = BUILD_STEP_NAMES.map((name) => ({
      name,
      status: "pending" as const,
      costUsd: 0,
    }));
    setBuildSteps(initialSteps);
    setBuildError(null);
    setTotalCostUsd(0);
    setIsBuilding(true);
    setView("building");

    let totalCost = 0;

    for (const stepName of BUILD_STEP_NAMES) {
      updateBuildStep(stepName, { status: "running" });

      await new Promise<void>((resolve) => {
        setTimeout(resolve, STEP_DELAY_MS);
      });

      const cost = SIMULATED_COSTS[stepName] ?? 0;
      totalCost += cost;

      updateBuildStep(stepName, { status: "done", costUsd: cost });
      setTotalCostUsd(totalCost);
    }

    setIsBuilding(false);
  }, [
    setBuildSteps,
    setBuildError,
    setTotalCostUsd,
    setIsBuilding,
    setView,
    updateBuildStep,
  ]);

  const handleGoToPersona = useCallback(() => {
    setView("persona");
  }, [setView]);

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">ビルド</h2>

      {!tweets && !isBuilding && buildSteps.length === 0 && <FileUpload />}

      {tweets && !isBuilding && buildSteps.length === 0 && (
        <div className="space-y-4">
          <FileUploadResult />
          <button
            type="button"
            onClick={() => void startBuild()}
            className="w-full rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            ビルドを開始
          </button>
        </div>
      )}

      {buildSteps.length > 0 && (
        <div className="space-y-4">
          <BuildProgress />

          {allDone && (
            <button
              type="button"
              onClick={handleGoToPersona}
              className="w-full rounded-md bg-green-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              ペルソナを確認する
            </button>
          )}
        </div>
      )}
    </section>
  );
}
