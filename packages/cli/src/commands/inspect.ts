import { Command } from "commander";
import { join } from "node:path";
import { StepCacheManager } from "@groa/pipeline";
import { validateBuildName } from "./build-name.js";

const SYNTHESIZE_STEP = "synthesize";
const DEFAULT_CACHE_DIR = ".groa";

export function inspectCommand(): Command {
  return new Command("inspect")
    .description("PersonaDocument の内容を表示する")
    .argument("<name>", "ビルド名")
    .action(async (name: string) => {
      validateBuildName(name);
      const result = await runInspect(name);
      console.log(result);
    });
}

export async function runInspect(
  name: string,
  cwd = process.cwd(),
): Promise<string> {
  const cacheDir = join(cwd, DEFAULT_CACHE_DIR, name);
  const cacheManager = new StepCacheManager(cacheDir);

  const cached = await cacheManager.read(SYNTHESIZE_STEP);
  if (!cached) {
    throw new Error(
      `PersonaDocument が見つかりません。\n→ 先に \`groa build ${name} <tweets.json>\` を実行してください。`,
    );
  }

  const output = cached.output as Record<string, unknown>;
  return JSON.stringify(output, null, 2);
}
