import { Command } from "commander";
import type { BackendType } from "@groa/config";
import type { SessionParams } from "@groa/generate";
import { runSessionPipeline } from "@groa/pipeline";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { ensureConsent } from "./consent.js";
import { validateBuildName } from "./build-name.js";
import { loadBuildArtifacts } from "./build-artifacts.js";
import { createSessionProgressDisplay } from "./session-display.js";

interface ConverseCommandOptions {
  turns?: string;
  autoLimit: string;
  temp: string;
  maxLength: string;
  eval: boolean;
}

export function converseCommand(): Command {
  return new Command("converse")
    .description("連続会話を生成する")
    .argument("<name>", "ビルド名")
    .argument("<topic>", "会話トピック")
    .option("--turns <number>", "ターン数（未指定で自動判断）")
    .option("--auto-limit <number>", "自動判断時の最大ターン数", "8")
    .option("--temp <number>", "temperature (0.3-1.0)", "0.7")
    .option("--max-length <number>", "1発言の最大文字数", "280")
    .option("--no-eval", "最終評価をスキップ")
    .action(
      async (name: string, topic: string, options: ConverseCommandOptions, cmd: Command) => {
        validateBuildName(name);
        const globalOpts = cmd.parent?.parent?.opts() ?? {};
        await runConverseCommand(name, topic, {
          turns: options.turns ? parseInt(options.turns, 10) : undefined,
          autoTurnLimit: parseInt(options.autoLimit, 10),
          temperature: parseFloat(options.temp),
          maxLength: parseInt(options.maxLength, 10),
          skipEvaluation: !options.eval,
          backend: globalOpts.backend as string | undefined,
          costLimit: globalOpts.costLimit as boolean | undefined,
        });
      },
    );
}

export async function runConverseCommand(
  name: string,
  topic: string,
  options: {
    turns?: number;
    autoTurnLimit?: number;
    temperature?: number;
    maxLength?: number;
    skipEvaluation?: boolean;
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
  const costLimitUsd = options.costLimit === false ? null : config.costLimitUsd;

  console.log(`Topic: ${topic}`);
  console.log(`Mode: converse`);
  console.log(`Backend: ${config.backend}`);

  const params: SessionParams = {
    mode: "converse",
    topic,
    temperature: options.temperature ?? config.steps.generate.defaultTemperature,
    maxLength: options.maxLength ?? config.steps.generate.maxLength,
    maxTurns: options.turns ?? null,
    autoTurnLimit: options.autoTurnLimit ?? config.steps.generate.autoTurnLimit,
  };

  const session = await runSessionPipeline(config, [context], params, {
    onProgress: createSessionProgressDisplay(),
    costLimitUsd,
    skipEvaluation: options.skipEvaluation,
    callbacks: {
      onTurnComplete: (turn) => {
        console.log(`\n[Turn ${turn.index + 1}] ${turn.text}`);
      },
    },
  });

  // ターンはonTurnCompleteでリアルタイム表示済み。評価スコアのみ表示。
  if (session.evaluation) {
    console.log("");
    console.log(`  authenticity: ${session.evaluation.authenticity.toFixed(1)}`);
    console.log(`  coherence: ${session.evaluation.coherence.toFixed(1)}`);
    console.log(`  consistency: ${session.evaluation.consistency.toFixed(1)}`);
  }
}
