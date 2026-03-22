import { defineConfig } from "vitest/config";

const packages = [
  "types",
  "config",
  "llm-client",
  "preprocess",
  "stats",
  "classify",
  "analyze",
  "synthesize",
  "embed",
  "retrieve",
  "generate",
  "evaluate",
  "pipeline",
  "cli",
  "convert",
  "web",
] as const;

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      // パッケージ単位のユニットテスト
      ...packages.map((pkg) => ({
        test: {
          name: pkg,
          root: `packages/${pkg}`,
          include: ["src/**/*.test.ts"],
          passWithNoTests: true,
          environment: pkg === "web" ? "happy-dom" : "node",
        },
      })),
      // 統合テスト（実LLM呼び出しを含む。明示的に `--project integration` で実行）
      {
        test: {
          name: "integration",
          root: ".",
          include: ["test/**/*.integration.test.ts"],
          passWithNoTests: true,
          environment: "node",
        },
      },
    ],
  },
});
