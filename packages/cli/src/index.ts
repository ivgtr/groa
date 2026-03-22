import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { configCommand } from "./commands/config.js";
import { inspectCommand } from "./commands/inspect.js";
import { costCommand } from "./commands/cost.js";
import { cleanCommand } from "./commands/clean.js";

/** CLI プログラムを構築する */
export function createProgram(): Command {
  const program = new Command()
    .name("groa")
    .description(
      "ツイートデータから人格プロファイルを抽出し「らしい」テキストを生成するツール",
    )
    .version("0.1.0")
    .option("--backend <type>", "バックエンド種別 (api | claude-code)")
    .option("--force", "キャッシュを無視して再実行する")
    .option("--no-cost-limit", "コスト上限を無効にする");

  program.addCommand(initCommand());
  program.addCommand(configCommand());
  program.addCommand(inspectCommand());
  program.addCommand(costCommand());
  program.addCommand(cleanCommand());

  return program;
}

export { initCommand, runInit } from "./commands/init.js";
export { configCommand, loadConfig } from "./commands/config.js";
export { inspectCommand, runInspect } from "./commands/inspect.js";
export { costCommand, runCost, collectCostSummary } from "./commands/cost.js";
export type { CostSummary } from "./commands/cost.js";
export { cleanCommand, runClean } from "./commands/clean.js";
export { assertFileExists, readJsonFile } from "./commands/validate.js";
export {
  hasConsent,
  saveConsent,
  ensureConsent,
} from "./commands/consent.js";
