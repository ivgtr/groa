import type { PersonaDocument, TaggedTweet } from "@groa/types";
import { StepCacheManager } from "@groa/pipeline";
import { deserializeEmbeddingIndex } from "@groa/embed";
import type { PersonaContext } from "@groa/generate";

/**
 * ビルド成果物をキャッシュから読み込み、PersonaContext を構築する。
 * 必要なキャッシュが存在しない場合はエラーをスローする。
 */
export async function loadBuildArtifacts(
  cacheDir: string,
  buildName: string,
): Promise<PersonaContext> {
  const cache = new StepCacheManager(cacheDir);

  const synthesizeCache = await cache.read("synthesize");
  if (!synthesizeCache) {
    throw new Error(
      `ビルド済みプロファイルが見つかりません。\n→ 先に \`groa build ${buildName} <tweets.json>\` を実行してください。`,
    );
  }

  const classifyCache = await cache.read("classify");
  if (!classifyCache) {
    throw new Error(
      `分類結果が見つかりません。\n→ 先に \`groa build ${buildName} <tweets.json>\` を実行してください。`,
    );
  }

  const embedCache = await cache.read("embed");
  if (!embedCache) {
    throw new Error(
      `Embedding結果が見つかりません。\n→ 先に \`groa build ${buildName} <tweets.json>\` を実行してください。`,
    );
  }

  return {
    buildName,
    persona: synthesizeCache.output as PersonaDocument,
    taggedTweets: classifyCache.output as TaggedTweet[],
    embeddingIndex: deserializeEmbeddingIndex(embedCache.output),
  };
}
