import { Command } from "commander";
import { join } from "node:path";
import { StepCacheManager } from "@groa/pipeline";

const DEFAULT_CACHE_DIR = ".groa";

const STEP_ORDER = [
  "preprocess",
  "stats",
  "classify",
  "analyze",
  "synthesize",
  "embed",
  "retrieve",
  "generate",
  "evaluate",
];

export function cleanCommand(): Command {
  return new Command("clean")
    .description("キャッシュを削除する")
    .option("--step <name>", "特定ステップのキャッシュのみ削除する")
    .action(async (options: { step?: string }) => {
      const result = await runClean(options.step);
      console.log(result);
    });
}

export async function runClean(
  stepName?: string,
  cwd = process.cwd(),
): Promise<string> {
  const cacheDir = join(cwd, DEFAULT_CACHE_DIR);
  const cacheManager = new StepCacheManager(cacheDir);

  if (stepName != null) {
    return cleanStep(cacheManager, stepName);
  }

  return cleanAll(cacheManager);
}

async function cleanAll(cacheManager: StepCacheManager): Promise<string> {
  const steps = await cacheManager.listCachedSteps();
  if (steps.length === 0) {
    return "削除するキャッシュがありません。";
  }

  await cacheManager.deleteAll();
  return `${steps.length} 件のキャッシュを削除しました。`;
}

async function cleanStep(
  cacheManager: StepCacheManager,
  stepName: string,
): Promise<string> {
  // 指定ステップ以降を連鎖無効化
  const deleted = await cacheManager.invalidateFrom(stepName, STEP_ORDER);

  if (deleted.length === 0) {
    // 直接削除を試みる（STEP_ORDER に含まれないカスタムステップ名の場合）
    const success = await cacheManager.delete(stepName);
    if (!success) {
      throw new Error(
        `ステップ "${stepName}" のキャッシュが見つかりません。\n→ \`groa clean\` で全キャッシュを削除できます。`,
      );
    }
    return `${stepName} のキャッシュを削除しました。`;
  }

  return `${deleted.join(", ")} のキャッシュを削除しました。`;
}
