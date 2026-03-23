import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { configCommand } from "./commands/config.js";
import { buildCommand } from "./commands/build.js";
import { stepCommand } from "./commands/step.js";
import { inspectCommand } from "./commands/inspect.js";
import { costCommand } from "./commands/cost.js";
import { cleanCommand } from "./commands/clean.js";
import { generateCommand } from "./commands/generate.js";

/** CLI プログラムを構築する */
export function createProgram(): Command {
  const program = new Command()
    .name("groa")
    .description(
      "ツイートデータから人格プロファイルを抽出し「らしい」テキストを生成するツール",
    )
    .version("0.1.0")
    .option("--backend <type>", "バックエンド種別 (anthropic | openrouter | claude-code)")
    .option("--force", "キャッシュを無視して再実行する")
    .option("--no-cost-limit", "コスト上限を無効にする");

  program.addCommand(initCommand());
  program.addCommand(configCommand());
  program.addCommand(buildCommand());
  program.addCommand(stepCommand());
  program.addCommand(inspectCommand());
  program.addCommand(costCommand());
  program.addCommand(cleanCommand());
  program.addCommand(generateCommand());

  return program;
}

export { initCommand, runInit, runInitInteractive } from "./commands/init.js";
export type { InitPrompts } from "./commands/init.js";
export { configCommand, loadConfig, configFilePath } from "./commands/config.js";
export { buildCommand, runBuildCommand } from "./commands/build.js";
export { stepCommand, runStepCommand } from "./commands/step.js";
export { inspectCommand, runInspect } from "./commands/inspect.js";
export { costCommand, runCost, collectCostSummary } from "./commands/cost.js";
export type { CostSummary } from "./commands/cost.js";
export { cleanCommand, runClean } from "./commands/clean.js";
export { generateCommand } from "./commands/generate.js";
export { tweetCommand, runTweetCommand } from "./commands/generate-tweet.js";
export { converseCommand, runConverseCommand } from "./commands/generate-converse.js";
export { multiCommand, runMultiCommand } from "./commands/generate-multi.js";
export { chatCommand, runChatCommand } from "./commands/generate-chat.js";
export { loadBuildArtifacts } from "./commands/build-artifacts.js";
export {
  assertFileExists,
  readJsonFile,
  readJsonSource,
  isUrl,
} from "./commands/validate.js";
export {
  validateBuildName,
} from "./commands/build-name.js";
export {
  hasConsent,
  saveConsent,
  ensureConsent,
} from "./commands/consent.js";
