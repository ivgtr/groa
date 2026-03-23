import { Command } from "commander";
import type {
  PersonaDocument,
  TaggedTweet,
  EmbeddingIndex,
  GeneratedText,
} from "@groa/types";
import type { BackendType } from "@groa/config";
import type { GenerateParams } from "@groa/generate";
import { runGenerate, StepCacheManager } from "@groa/pipeline";
import type { StepEvent } from "@groa/pipeline";
import { loadConfig } from "./config.js";
import { ensureConsent } from "./consent.js";
import { createProgressDisplay } from "../progress-display.js";

interface GenerateCommandOptions {
  numVariants: string;
  temp: string;
  maxLength: string;
  styleHint?: string;
}

export function generateCommand(): Command {
  return new Command("generate")
    .description("トピックに基づいてテキストを生成する (Step 6-8)")
    .argument("<topic>", "生成トピック")
    .option("-n, --num-variants <number>", "バリアント数", "1")
    .option("--temp <number>", "temperature (0.3-1.0)", "0.7")
    .option("--max-length <number>", "最大文字数", "280")
    .option("--style-hint <hint>", "スタイルヒント")
    .action(
      async (topic: string, options: GenerateCommandOptions, cmd: Command) => {
        const globalOpts = cmd.parent?.opts() ?? {};
        await runGenerateCommand(topic, {
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

export async function runGenerateCommand(
  topic: string,
  options: {
    numVariants?: number;
    temperature?: number;
    maxLength?: number;
    styleHint?: string | null;
    backend?: string;
    costLimit?: boolean;
  } = {},
): Promise<void> {
  // 1. Load config
  const config = await loadConfig();

  // 2. Override backend if specified
  if (options.backend) {
    config.backend = options.backend as BackendType;
  }

  // 3. Ensure consent
  if (config.backend === "anthropic" || config.backend === "openrouter") {
    await ensureConsent(config.cacheDir);
  }

  // 4. Read build artifacts from cache
  const cache = new StepCacheManager(config.cacheDir);

  const synthesizeCache = await cache.read("synthesize");
  if (!synthesizeCache) {
    throw new Error(
      "ビルド済みプロファイルが見つかりません。\n→ 先に `groa build <tweets.json>` を実行してください。",
    );
  }

  const classifyCache = await cache.read("classify");
  if (!classifyCache) {
    throw new Error(
      "分類結果が見つかりません。\n→ 先に `groa build <tweets.json>` を実行してください。",
    );
  }

  const embedCache = await cache.read("embed");
  if (!embedCache) {
    throw new Error(
      "Embedding結果が見つかりません。\n→ 先に `groa build <tweets.json>` を実行してください。",
    );
  }

  const persona = synthesizeCache.output as PersonaDocument;
  const taggedTweets = classifyCache.output as TaggedTweet[];
  const embeddingIndex = embedCache.output as EmbeddingIndex;

  // 5. Build generate params
  const params: GenerateParams = {
    topic,
    temperature: options.temperature ?? config.steps.generate.defaultTemperature,
    maxLength: options.maxLength ?? config.steps.generate.maxLength,
    numVariants: options.numVariants ?? config.steps.generate.numVariants,
    styleHint: options.styleHint ?? null,
  };

  // 6. Determine cost limit
  const costLimitUsd =
    options.costLimit === false ? null : config.costLimitUsd;

  // 7. Run generate with progress display
  console.log(`Topic: ${topic}`);
  console.log(`Backend: ${config.backend}`);

  const result = await runGenerate(
    config,
    persona,
    taggedTweets,
    embeddingIndex,
    params,
    {
      onProgress: createGenerateProgressDisplay(),
      costLimitUsd,
    },
  );

  // 8. Display results
  displayResults(result);
}

export function createGenerateProgressDisplay(): (event: StepEvent) => void {
  return createProgressDisplay({
    stepNames: {
      retrieve: "Retrieving similar tweets",
      generate: "Generating text",
      evaluate: "Evaluating quality",
    },
    stepIndexOffset: 6,
  });
}

export function displayResults(
  result: GeneratedText | GeneratedText[],
): void {
  const results = Array.isArray(result) ? result : [result];

  console.log("");
  for (let i = 0; i < results.length; i++) {
    const gen = results[i];
    if (!gen) continue;
    if (results.length > 1) {
      console.log(`--- Variant ${i + 1} ---`);
    }
    console.log(gen.text);
    if (gen.evaluation) {
      console.log(`  authenticity: ${gen.evaluation.authenticity.toFixed(1)}`);
      console.log(
        `  styleNaturalness: ${gen.evaluation.styleNaturalness.toFixed(1)}`,
      );
      console.log(
        `  attitudeConsistency: ${gen.evaluation.attitudeConsistency.toFixed(1)}`,
      );
    }
    if (results.length > 1 && i < results.length - 1) {
      console.log("");
    }
  }
}
