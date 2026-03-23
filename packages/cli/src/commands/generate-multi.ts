import { Command } from "commander";
import type { BackendType } from "@groa/config";
import type { SessionParams, PersonaContext } from "@groa/generate";
import { runSessionPipeline } from "@groa/pipeline";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { ensureConsent } from "./consent.js";
import { validateBuildName } from "./build-name.js";
import { loadBuildArtifacts } from "./build-artifacts.js";
import { createSessionProgressDisplay } from "./session-display.js";

interface MultiCommandOptions {
  topic?: string;
  turns?: string;
  temp: string;
  maxLength: string;
}

export function multiCommand(): Command {
  return new Command("multi")
    .description("マルチプロファイル会話を生成する")
    .argument("<names...>", "ビルド名（2つ以上）")
    .option("--topic <topic>", "会話トピック（省略時: 自動生成）")
    .option("--turns <number>", "総ターン数")
    .option("--temp <number>", "temperature (0.3-1.0)", "0.7")
    .option("--max-length <number>", "1発言の最大文字数", "280")
    .action(
      async (names: string[], options: MultiCommandOptions, cmd: Command) => {
        if (names.length < 2) {
          throw new Error("マルチプロファイル会話には2つ以上のビルド名が必要です。");
        }
        for (const name of names) validateBuildName(name);
        const globalOpts = cmd.parent?.parent?.opts() ?? {};
        await runMultiCommand(names, {
          topic: options.topic,
          turns: options.turns ? parseInt(options.turns, 10) : undefined,
          temperature: parseFloat(options.temp),
          maxLength: parseInt(options.maxLength, 10),
          backend: globalOpts.backend as string | undefined,
          costLimit: globalOpts.costLimit as boolean | undefined,
        });
      },
    );
}

export async function runMultiCommand(
  names: string[],
  options: {
    topic?: string;
    turns?: number;
    temperature?: number;
    maxLength?: number;
    backend?: string;
    costLimit?: boolean;
  },
): Promise<void> {
  const config = await loadConfig();
  if (options.backend) config.backend = options.backend as BackendType;
  if (config.backend === "anthropic" || config.backend === "openrouter") {
    await ensureConsent(config.cacheDir);
  }

  const contexts: PersonaContext[] = [];
  for (const name of names) {
    const buildDir = join(config.cacheDir, name);
    contexts.push(await loadBuildArtifacts(buildDir, name));
  }

  const topic = options.topic ?? `${names.join("と")}の会話`;
  const defaultTurns = names.length * 3;
  const costLimitUsd = options.costLimit === false ? null : config.costLimitUsd;

  console.log(`Topic: ${topic}`);
  console.log(`Participants: ${names.join(", ")}`);
  console.log(`Mode: multi`);
  console.log(`Backend: ${config.backend}`);

  const params: SessionParams = {
    mode: "multi",
    topic,
    temperature: options.temperature ?? config.steps.generate.defaultTemperature,
    maxLength: options.maxLength ?? config.steps.generate.maxLength,
    maxTurns: options.turns ?? defaultTurns,
  };

  const session = await runSessionPipeline(config, contexts, params, {
    onProgress: createSessionProgressDisplay(),
    costLimitUsd,
    skipEvaluation: true,
    callbacks: {
      onTurnComplete: (turn) => {
        console.log(`[${turn.speakerId}]: ${turn.text}`);
      },
    },
  });

  console.log(`\nSession saved: ${session.id}`);
}
