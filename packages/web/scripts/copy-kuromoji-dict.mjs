/**
 * kuromoji.js の辞書ファイルを public/dict/ にコピーするスクリプト
 *
 * 使い方: node scripts/copy-kuromoji-dict.mjs
 */

import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const kuromojiPath = dirname(require.resolve("kuromoji/package.json"));
const srcDict = join(kuromojiPath, "dict");
const destDict = join(dirname(new URL(import.meta.url).pathname), "..", "public", "dict");

if (!existsSync(srcDict)) {
  console.error(`kuromoji 辞書が見つかりません: ${srcDict}`);
  process.exit(1);
}

mkdirSync(destDict, { recursive: true });
cpSync(srcDict, destDict, { recursive: true });
console.log(`kuromoji 辞書をコピーしました: ${srcDict} -> ${destDict}`);
