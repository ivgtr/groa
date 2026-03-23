import { createHash } from "node:crypto";
import { readFile, writeFile, unlink, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Timestamp } from "@groa/types";
import { Timestamp as toTimestamp } from "@groa/types";
import type { CostRecord } from "@groa/llm-client";

/** キャッシュに保存されるステップの中間結果 */
export interface StepCache {
  inputHash: string;
  output: unknown;
  timestamp: Timestamp;
  cost: CostRecord | null;
}

/** キャッシュの永続化フォーマット */
interface StepCacheFile {
  inputHash: string;
  output: unknown;
  timestamp: number;
  cost: CostRecord | null;
}

const CACHE_FILE_SUFFIX = ".json";

/** APIキーとして検出するパターン */
const API_KEY_PATTERNS = [
  /sk-ant-/i,
  /sk-[a-zA-Z0-9]{20,}/,
];

/**
 * 中間結果の永続化・入力ハッシュスキップを管理する。
 * 各ステップの出力を `{cacheDir}/{stepName}.json` に保存し、
 * 再実行時に入力ハッシュが一致すればスキップする。
 */
export class StepCacheManager {
  constructor(private readonly cacheDir: string) {}

  /**
   * 入力データと設定値からSHA-256ハッシュを計算する。
   * API キーはハッシュ対象から除外する。
   */
  computeHash(input: unknown): string {
    const sanitized = this.stripSensitiveData(input);
    const json = JSON.stringify(sanitized, null, 0);
    return createHash("sha256").update(json).digest("hex");
  }

  /**
   * キャッシュが有効か判定する。
   * 入力ハッシュが一致し、force=false ならスキップ可能。
   */
  async shouldSkip(
    stepName: string,
    inputHash: string,
    force: boolean,
  ): Promise<boolean> {
    if (force) return false;

    const cached = await this.read(stepName);
    if (!cached) return false;

    return cached.inputHash === inputHash;
  }

  /** キャッシュを読み込む。存在しなければ null を返す。 */
  async read(stepName: string): Promise<StepCache | null> {
    const filePath = this.filePath(stepName);
    try {
      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content) as StepCacheFile;
      return {
        inputHash: data.inputHash,
        output: data.output,
        timestamp: toTimestamp(data.timestamp),
        cost: data.cost,
      };
    } catch {
      return null;
    }
  }

  /** ステップの出力をキャッシュに保存する。 */
  async write(
    stepName: string,
    inputHash: string,
    output: unknown,
    cost: CostRecord | null = null,
  ): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });

    const sanitizedOutput = this.stripSensitiveData(output);

    const data: StepCacheFile = {
      inputHash,
      output: sanitizedOutput,
      timestamp: Date.now(),
      cost,
    };

    const json = JSON.stringify(data, null, 2);
    this.assertNoApiKeys(json, stepName);

    await writeFile(this.filePath(stepName), json, "utf-8");
  }

  /** 特定ステップのキャッシュを削除する。削除成功で true を返す。 */
  async delete(stepName: string): Promise<boolean> {
    try {
      await unlink(this.filePath(stepName));
      return true;
    } catch {
      return false;
    }
  }

  /** 全キャッシュを削除する。 */
  async deleteAll(): Promise<void> {
    const steps = await this.listCachedSteps();
    await Promise.all(steps.map((s) => this.delete(s)));
  }

  /** 指定ステップ以降のキャッシュを無効化する（連鎖無効化）。 */
  async invalidateFrom(
    stepName: string,
    stepOrder: string[],
  ): Promise<string[]> {
    const idx = stepOrder.indexOf(stepName);
    if (idx === -1) return [];

    const toInvalidate = stepOrder.slice(idx);
    const deleted: string[] = [];

    for (const step of toInvalidate) {
      const success = await this.delete(step);
      if (success) deleted.push(step);
    }

    return deleted;
  }

  /** キャッシュされているステップ名の一覧を取得する。 */
  async listCachedSteps(): Promise<string[]> {
    try {
      const files = await readdir(this.cacheDir);
      return files
        .filter((f) => f.endsWith(CACHE_FILE_SUFFIX))
        .map((f) => f.slice(0, -CACHE_FILE_SUFFIX.length));
    } catch {
      return [];
    }
  }

  private filePath(stepName: string): string {
    return join(this.cacheDir, `${stepName}${CACHE_FILE_SUFFIX}`);
  }

  /**
   * オブジェクトからAPIキー等の機密データを除去する。
   * apiKey, api_key, apiKeys 等のフィールドを再帰的に "[REDACTED]" に置換する。
   */
  private stripSensitiveData(data: unknown): unknown {
    if (data === null || data === undefined) return data;
    if (typeof data !== "object") return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.stripSensitiveData(item));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      data as Record<string, unknown>,
    )) {
      if (/api_?key/i.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = this.stripSensitiveData(value);
      }
    }
    return result;
  }

  /**
   * JSON文字列にAPIキーパターンが含まれていないことを検証する。
   * 含まれていた場合、エラーをスローして書き込みを中止する。
   */
  private assertNoApiKeys(json: string, stepName: string): void {
    for (const pattern of API_KEY_PATTERNS) {
      if (pattern.test(json)) {
        throw new Error(
          `キャッシュにAPIキーが含まれています (step: ${stepName})。` +
            `出力データからAPIキーを除去してください。`,
        );
      }
    }
  }
}
