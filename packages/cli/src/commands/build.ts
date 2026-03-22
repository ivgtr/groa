import { Command } from "commander";
import { TweetSchema } from "@groa/types";
import type { Tweet } from "@groa/types";
import type { BackendType } from "@groa/config";
import { runBuild } from "@groa/pipeline";
import type { StepEvent } from "@groa/pipeline";
import { loadConfig } from "./config.js";
import { readJsonSource } from "./validate.js";
import { ensureConsent } from "./consent.js";

export function buildCommand(): Command {
  return new Command("build")
    .description("ツイートデータからプロファイルを構築する (Step 0-5)")
    .argument("<tweets>", "ツイートデータのJSONファイルパスまたはURL")
    .action(async (tweetsPath: string, _options: unknown, cmd: Command) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await runBuildCommand(tweetsPath, {
        backend: globalOpts.backend as string | undefined,
        force: globalOpts.force as boolean | undefined,
        costLimit: globalOpts.costLimit as boolean | undefined,
      });
    });
}

export async function runBuildCommand(
  tweetsPath: string,
  options: {
    backend?: string;
    force?: boolean;
    costLimit?: boolean;
  } = {},
): Promise<void> {
  // 1. Load config
  const config = await loadConfig();

  // 2. Override backend if specified
  if (options.backend) {
    config.backend = options.backend as BackendType;
  }

  // 3. Read and validate tweets JSON
  const rawJson = await readJsonSource(
    tweetsPath,
    "ツイートデータのJSONファイルまたはURLを指定してください",
  );
  const tweets = validateTweets(rawJson);

  // 4. Show backend info
  console.log(`Backend: ${config.backend}`);

  // 5. Ensure consent for data sending (api backend only)
  if (config.backend === "api") {
    await ensureConsent(config.cacheDir);
  }

  // 6. Determine cost limit
  const costLimitUsd =
    options.costLimit === false ? null : config.costLimitUsd;

  // 7. Run build with progress display
  await runBuild(config, tweets, {
    onProgress: createProgressDisplay(),
    force: options.force ?? false,
    costLimitUsd,
  });
}

export function validateTweets(raw: unknown): Tweet[] {
  if (!Array.isArray(raw)) {
    throw new Error("ツイートデータは配列形式である必要があります。");
  }

  if (raw.length < 10) {
    throw new Error(
      `ツイートデータが少なすぎます（${raw.length}件）。最低10件必要です。`,
    );
  }

  if (raw.length > 50000) {
    throw new Error(
      `ツイートデータが多すぎます（${raw.length}件）。最大50,000件までです。`,
    );
  }

  if (raw.length < 100) {
    console.warn(
      `⚠ ツイートが${raw.length}件です。精度向上には3,000件以上を推奨します。`,
    );
  }

  const tweets: Tweet[] = [];
  for (let i = 0; i < raw.length; i++) {
    const result = TweetSchema.safeParse(raw[i]);
    if (!result.success) {
      throw new Error(
        `ツイート #${i + 1} のフォーマットが不正です: ${result.error.message}`,
      );
    }
    tweets.push(result.data);
  }

  return tweets;
}

export function createProgressDisplay(): (event: StepEvent) => void {
  const stepNames: Record<string, string> = {
    preprocess: "Preprocessing",
    stats: "Analyzing style",
    classify: "Classifying",
    analyze: "Analyzing clusters",
    synthesize: "Synthesizing persona",
    embed: "Building embedding index",
  };

  return (event: StepEvent) => {
    switch (event.type) {
      case "step-start":
        process.stdout.write(
          `[Step ${event.stepIndex}] ${stepNames[event.stepName] ?? event.stepName}...`,
        );
        break;
      case "step-complete":
        console.log(` [$${event.costUsd.toFixed(2)}]`);
        break;
      case "pipeline-complete":
        console.log(
          `✓ Profile built. Total cost: $${event.totalCostUsd.toFixed(2)}`,
        );
        break;
      case "cost-limit-exceeded":
        console.error(
          `✗ コスト上限に達しました: $${event.currentCostUsd.toFixed(2)} / $${event.limitUsd.toFixed(2)}`,
        );
        break;
    }
  };
}
