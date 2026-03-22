import { Command } from "commander";
import { join } from "node:path";
import { StepCacheManager } from "@groa/pipeline";
import type { StepCache } from "@groa/pipeline";

const DEFAULT_CACHE_DIR = ".groa";

export function costCommand(): Command {
  return new Command("cost")
    .description("累計コストを表示する")
    .action(async () => {
      const result = await runCost();
      console.log(result);
    });
}

export interface CostSummary {
  steps: Array<{ stepName: string; costUsd: number }>;
  totalUsd: number;
}

export async function runCost(
  cwd = process.cwd(),
): Promise<string> {
  const cacheDir = join(cwd, DEFAULT_CACHE_DIR);
  const cacheManager = new StepCacheManager(cacheDir);

  const stepNames = await cacheManager.listCachedSteps();
  if (stepNames.length === 0) {
    throw new Error(
      `キャッシュが見つかりません。\n→ 先に \`groa build\` を実行してください。`,
    );
  }

  const summary = await collectCostSummary(cacheManager, stepNames);
  return formatCostSummary(summary);
}

export async function collectCostSummary(
  cacheManager: StepCacheManager,
  stepNames: string[],
): Promise<CostSummary> {
  const steps: Array<{ stepName: string; costUsd: number }> = [];
  let totalUsd = 0;

  for (const stepName of stepNames) {
    const cached: StepCache | null = await cacheManager.read(stepName);
    const costUsd = cached?.cost?.estimatedUsd ?? 0;
    steps.push({ stepName, costUsd });
    totalUsd += costUsd;
  }

  return { steps, totalUsd };
}

function formatCostSummary(summary: CostSummary): string {
  const lines: string[] = [];

  for (const step of summary.steps) {
    lines.push(`  ${step.stepName}: $${step.costUsd.toFixed(4)}`);
  }

  lines.push(`\n合計: $${summary.totalUsd.toFixed(4)}`);
  return lines.join("\n");
}
