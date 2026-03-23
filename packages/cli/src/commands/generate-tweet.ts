import { Command } from "commander";
import type { BackendType } from "@groa/config";
import type { SessionParams } from "@groa/generate";
import { runSessionPipeline } from "@groa/pipeline";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { ensureConsent } from "./consent.js";
import { validateBuildName } from "./build-name.js";
import { loadBuildArtifacts } from "./build-artifacts.js";
import { displaySession, createSessionProgressDisplay } from "./session-display.js";

interface TweetCommandOptions {
  numVariants: string;
  temp: string;
  maxLength: string;
  styleHint?: string;
}

export function tweetCommand(): Command {
  return new Command("tweet")
    .description("単発テキストを生成する")
    .argument("<name>", "ビルド名")
    .argument("<topic>", "生成トピック")
    .option("-n, --num-variants <number>", "バリアント数", "1")
    .option("--temp <number>", "temperature (0.3-1.0)", "0.7")
    .option("--max-length <number>", "最大文字数", "280")
    .option("--style-hint <hint>", "スタイルヒント")
    .action(
      async (name: string, topic: string, options: TweetCommandOptions, cmd: Command) => {
        validateBuildName(name);
        const globalOpts = cmd.parent?.parent?.opts() ?? {};
        await runTweetCommand(name, topic, {
          numVariants: parseInt(options.numVariants, 10),
          temperature: parseFloat(options.temp),
          maxLength: parseInt(options.maxLength, 10),
          styleHint: options.styleHint ?? null,
          backend: globalOpts.backend as string | undefined,
          costLimit: globalOpts.costLimit as boolean | undefined,
        });
      },
    );
}

export async function runTweetCommand(
  name: string,
  topic: string,
  options: {
    numVariants?: number;
    temperature?: number;
    maxLength?: number;
    styleHint?: string | null;
    backend?: string;
    costLimit?: boolean;
  },
): Promise<void> {
  const config = await loadConfig();
  if (options.backend) config.backend = options.backend as BackendType;
  if (config.backend === "anthropic" || config.backend === "openrouter") {
    await ensureConsent(config.cacheDir);
  }

  const buildDir = join(config.cacheDir, name);
  const context = await loadBuildArtifacts(buildDir, name);

  const numVariants = options.numVariants ?? config.steps.generate.numVariants;
  const costLimitUsd = options.costLimit === false ? null : config.costLimitUsd;

  console.log(`Topic: ${topic}`);
  console.log(`Backend: ${config.backend}`);

  // numVariants > 1 の場合は独立したtweetセッションをN回実行
  for (let i = 0; i < numVariants; i++) {
    if (numVariants > 1) console.log(`\n--- Variant ${i + 1} ---`);

    const params: SessionParams = {
      mode: "tweet",
      topic,
      temperature: options.temperature ?? config.steps.generate.defaultTemperature,
      maxLength: options.maxLength ?? config.steps.generate.maxLength,
      styleHint: options.styleHint ?? null,
    };

    const session = await runSessionPipeline(config, [context], params, {
      onProgress: createSessionProgressDisplay(),
      costLimitUsd,
    });

    displaySession(session);
  }
}
