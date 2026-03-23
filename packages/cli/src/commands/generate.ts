import { Command } from "commander";
import { tweetCommand } from "./generate-tweet.js";
import { converseCommand } from "./generate-converse.js";
import { multiCommand } from "./generate-multi.js";
import { chatCommand } from "./generate-chat.js";

export function generateCommand(): Command {
  const cmd = new Command("generate")
    .description("テキストを生成する (Step 6-8)");

  cmd.addCommand(tweetCommand());
  cmd.addCommand(converseCommand());
  cmd.addCommand(multiCommand());
  cmd.addCommand(chatCommand());

  return cmd;
}
