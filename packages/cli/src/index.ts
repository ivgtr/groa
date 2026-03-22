import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { configCommand } from "./commands/config.js";

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

  return program;
}

export { initCommand, runInit } from "./commands/init.js";
export { configCommand, loadConfig } from "./commands/config.js";
