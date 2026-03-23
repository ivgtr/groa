import { Command } from "commander";
import { TweetSchema } from "@groa/types";
import type { Tweet } from "@groa/types";
import type { BackendType } from "@groa/config";
import { runBuild } from "@groa/pipeline";
import { createProgressDisplay } from "../progress-display.js";

import {
  detectFormat,
  convertTweets,
  buildDefinition,
  TWINT_DEFINITION,
  TWITTER_ARCHIVE_DEFINITION,
} from "@groa/convert";
import type { ConverterDefinition } from "@groa/convert";
import { loadConfig } from "./config.js";
import { readJsonSource } from "./validate.js";
import { ensureConsent } from "./consent.js";

/** 組み込みプリセット名 → ConverterDefinition */
const FORMAT_PRESETS: Record<string, ConverterDefinition> = {
  twint: TWINT_DEFINITION,
  "twitter-archive": TWITTER_ARCHIVE_DEFINITION,
};

export function buildCommand(): Command {
  return new Command("build")
    .description("ツイートデータからプロファイルを構築する (Step 0-5)")
    .argument("<tweets>", "ツイートデータのファイルパスまたはURL (.json, .js)")
    .option("--format <name>", "入力フォーマットを指定する (twint, twitter-archive)")
    .option("--map-id <key>", "id フィールドのソースキー")
    .option("--map-text <key>", "text フィールドのソースキー")
    .option("--map-timestamp <key>", "timestamp フィールドのソースキー")
    .option("--map-retweet <key>", "isRetweet フィールドのソースキー")
    .option("--map-media <key>", "hasMedia フィールドのソースキー")
    .option("--map-reply <key>", "replyTo フィールドのソースキー")
    .action(async (tweetsPath: string, options: Record<string, unknown>, cmd: Command) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await runBuildCommand(tweetsPath, {
        backend: globalOpts.backend as string | undefined,
        force: globalOpts.force as boolean | undefined,
        costLimit: globalOpts.costLimit as boolean | undefined,
        format: options.format as string | undefined,
        mapId: options.mapId as string | undefined,
        mapText: options.mapText as string | undefined,
        mapTimestamp: options.mapTimestamp as string | undefined,
        mapRetweet: options.mapRetweet as string | undefined,
        mapMedia: options.mapMedia as string | undefined,
        mapReply: options.mapReply as string | undefined,
      });
    });
}

export async function runBuildCommand(
  tweetsPath: string,
  options: {
    backend?: string;
    force?: boolean;
    costLimit?: boolean;
    format?: string;
    mapId?: string;
    mapText?: string;
    mapTimestamp?: string;
    mapRetweet?: string;
    mapMedia?: string;
    mapReply?: string;
  } = {},
): Promise<void> {
  // 1. Load config
  const config = await loadConfig();

  // 2. Override backend if specified
  if (options.backend) {
    config.backend = options.backend as BackendType;
  }

  // 3. Read and validate tweets JSON（必要に応じて変換）
  const rawJson = await readJsonSource(
    tweetsPath,
    "ツイートデータのファイル (.json, .js) またはURLを指定してください",
  );
  const tweets = resolveAndValidateTweets(rawJson, options);

  // 4. Show backend info
  console.log(`Backend: ${config.backend}`);

  // 5. Ensure consent for data sending
  if (config.backend === "anthropic" || config.backend === "openrouter") {
    await ensureConsent(config.cacheDir);
  }

  // 6. Determine cost limit
  const costLimitUsd =
    options.costLimit === false ? null : config.costLimitUsd;

  // 7. Run build with progress display
  await runBuild(config, tweets, {
    onProgress: createProgressDisplay({
      stepNames: {
        preprocess: "Preprocessing",
        stats: "Analyzing style",
        classify: "Classifying",
        analyze: "Analyzing clusters",
        synthesize: "Synthesizing persona",
        embed: "Building embedding index",
      },
      pipelineCompleteMessage: "✓ Profile built.",
    }),
    force: options.force ?? false,
    costLimitUsd,
  });
}

/**
 * 入力データを検出・変換してバリデーション済み Tweet[] を返す。
 *
 * フロー:
 * 1. --format 指定があればそのプリセットで変換
 * 2. --map-* 指定があればカスタム定義を構築して変換
 * 3. どちらもなければ自動検知（groa形式 → そのまま、既知形式 → 変換）
 */
export function resolveAndValidateTweets(
  raw: unknown,
  options: {
    format?: string;
    mapId?: string;
    mapText?: string;
    mapTimestamp?: string;
    mapRetweet?: string;
    mapMedia?: string;
    mapReply?: string;
  },
): Tweet[] {
  if (!Array.isArray(raw)) {
    throw new Error("ツイートデータは配列形式である必要があります。");
  }

  // --format プリセット指定
  if (options.format) {
    const definition = FORMAT_PRESETS[options.format];
    if (!definition) {
      const available = Object.keys(FORMAT_PRESETS).join(", ");
      throw new Error(
        `未知のフォーマット: "${options.format}"。利用可能: ${available}`,
      );
    }
    return convertAndValidate(raw, definition);
  }

  // --map-* カスタムマッピング指定
  const hasMapOptions =
    options.mapId !== undefined ||
    options.mapText !== undefined ||
    options.mapTimestamp !== undefined ||
    options.mapRetweet !== undefined ||
    options.mapMedia !== undefined ||
    options.mapReply !== undefined;

  if (hasMapOptions) {
    const definition = buildDefinition({
      id: options.mapId,
      text: options.mapText,
      timestamp: options.mapTimestamp,
      isRetweet: options.mapRetweet,
      hasMedia: options.mapMedia,
      replyTo: options.mapReply,
    });
    return convertAndValidate(raw, definition);
  }

  // 自動検知
  const detected = detectFormat(raw);

  if (detected.isNativeGroa) {
    return validateTweets(raw);
  }

  if (detected.formatName) {
    const definition = FORMAT_PRESETS[detected.formatName];
    if (definition) {
      console.log(`フォーマット検出: ${detected.formatName}`);
      return convertAndValidate(raw, definition);
    }
  }

  // 不明なフォーマット
  const keys = detected.detectedKeys.slice(0, 10).join(", ");
  const available = Object.keys(FORMAT_PRESETS).join(", ");
  throw new Error(
    `入力データの形式を判別できません。\n` +
    `検出されたキー: ${keys}\n` +
    `--format オプションでフォーマットを指定するか、--map-* オプションでキーマッピングを指定してください。\n` +
    `利用可能なフォーマット: ${available}`,
  );
}

/** 変換 → バリデーション のヘルパー */
function convertAndValidate(raw: unknown[], definition: ConverterDefinition): Tweet[] {
  const result = convertTweets(raw, definition);

  if (result.skippedCount > 0) {
    console.warn(
      `⚠ ${String(result.skippedCount)}件の変換をスキップしました（${String(result.convertedCount)}/${String(result.totalCount)}件成功）`,
    );
    for (const warning of result.warnings.slice(0, 5)) {
      console.warn(`  ${warning}`);
    }
    if (result.warnings.length > 5) {
      console.warn(`  ...他${String(result.warnings.length - 5)}件`);
    }
  }

  return validateTweets(result.tweets);
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

export { createProgressDisplay } from "../progress-display.js";
