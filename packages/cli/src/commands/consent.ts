import { access, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const CONSENT_FILE = ".consent";

const CONSENT_MESSAGE =
  "⚠ ツイートデータは外部 LLM API（Anthropic）に送信されます。\n" +
  "データの取り扱いについては各APIプロバイダの利用規約を確認してください。\n" +
  "続行しますか？ (y/N) ";

/** 同意済みかどうかを確認する */
export async function hasConsent(cacheDir: string): Promise<boolean> {
  try {
    await access(join(cacheDir, CONSENT_FILE));
    return true;
  } catch {
    return false;
  }
}

/** 同意記録を保存する */
export async function saveConsent(cacheDir: string): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(
    join(cacheDir, CONSENT_FILE),
    JSON.stringify({ consentedAt: new Date().toISOString() }),
    "utf-8",
  );
}

/**
 * LLM API へのデータ送信同意を確認する。
 * 同意済みならスキップ。未同意なら promptFn でユーザーに確認する。
 *
 * @param cacheDir - キャッシュディレクトリパス（同意記録の保存先）
 * @param promptFn - 確認プロンプト関数（テスト時に差し替え可能）
 */
export async function ensureConsent(
  cacheDir: string,
  promptFn?: (message: string) => Promise<boolean>,
): Promise<void> {
  if (await hasConsent(cacheDir)) return;

  const prompt = promptFn ?? defaultPrompt;
  const consented = await prompt(CONSENT_MESSAGE);

  if (!consented) {
    throw new Error(
      "データ送信への同意が必要です。\n→ `groa build` を再実行し、同意してください。",
    );
  }

  await saveConsent(cacheDir);
}

async function defaultPrompt(message: string): Promise<boolean> {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}
