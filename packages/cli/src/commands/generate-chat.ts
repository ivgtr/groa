import { Command } from "commander";
import { createInterface } from "node:readline";
import type { BackendType } from "@groa/config";
import type { SessionParams } from "@groa/generate";
import { runSessionPipeline } from "@groa/pipeline";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { ensureConsent } from "./consent.js";
import { validateBuildName } from "./build-name.js";
import { loadBuildArtifacts } from "./build-artifacts.js";
import { createSessionProgressDisplay } from "./session-display.js";

interface ChatCommandOptions {
  temp: string;
  maxLength: string;
  eval: boolean;
}

export function chatCommand(): Command {
  return new Command("chat")
    .description("インタラクティブチャットを開始する")
    .argument("<name>", "ビルド名")
    .option("--temp <number>", "temperature (0.3-1.0)", "0.7")
    .option("--max-length <number>", "最大文字数", "280")
    .option("--eval", "評価を有効化する")
    .action(
      async (name: string, options: ChatCommandOptions, cmd: Command) => {
        validateBuildName(name);
        const globalOpts = cmd.parent?.parent?.opts() ?? {};
        await runChatCommand(name, {
          temperature: parseFloat(options.temp),
          maxLength: parseInt(options.maxLength, 10),
          enableEval: options.eval ?? false,
          backend: globalOpts.backend as string | undefined,
          costLimit: globalOpts.costLimit as boolean | undefined,
        });
      },
    );
}

export async function runChatCommand(
  name: string,
  options: {
    temperature?: number;
    maxLength?: number;
    enableEval?: boolean;
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

  console.log(`Chat with: ${name}`);
  console.log(`Backend: ${config.backend}`);
  console.log('Type "quit" or press Ctrl+C to exit.\n');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const getUserInput = (): Promise<string | null> => {
    return new Promise((resolve) => {
      rl.question("You: ", (answer) => {
        const trimmed = answer.trim();
        if (trimmed === "" || trimmed.toLowerCase() === "quit") {
          resolve(null);
        } else {
          resolve(trimmed);
        }
      });
    });
  };

  const params: SessionParams = {
    mode: "chat",
    topic: "chat",
    temperature: options.temperature ?? config.steps.generate.defaultTemperature,
    maxLength: options.maxLength ?? config.steps.generate.maxLength,
  };

  try {
    const session = await runSessionPipeline(config, [context], params, {
      onProgress: createSessionProgressDisplay(),
      costLimitUsd,
      skipEvaluation: !options.enableEval,
      callbacks: {
        getUserInput,
        onTurnComplete: (turn) => {
          if (turn.speakerId !== "__user__") {
            console.log(`${name}: ${turn.text}\n`);
          }
        },
      },
    });

    console.log(`\nSession saved: ${session.id}`);
  } finally {
    rl.close();
  }
}
