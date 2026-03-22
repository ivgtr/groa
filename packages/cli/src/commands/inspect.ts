import { Command } from "commander";
import { join } from "node:path";
import { StepCacheManager } from "@groa/pipeline";
import { readJsonFile } from "./validate.js";

const SYNTHESIZE_STEP = "synthesize";
const DEFAULT_CACHE_DIR = ".groa";

export function inspectCommand(): Command {
  return new Command("inspect")
    .description("PersonaDocument の内容を表示する")
    .action(async () => {
      const result = await runInspect();
      console.log(result);
    });
}

export async function runInspect(
  cwd = process.cwd(),
): Promise<string> {
  const cacheDir = join(cwd, DEFAULT_CACHE_DIR);
  const cacheManager = new StepCacheManager(cacheDir);

  const cached = await cacheManager.read(SYNTHESIZE_STEP);
  if (!cached) {
    throw new Error(
      `PersonaDocument が見つかりません。\n→ 先に \`groa build\` を実行してください。`,
    );
  }

  const output = cached.output as Record<string, unknown>;
  return JSON.stringify(output, null, 2);
}
