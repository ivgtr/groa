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
  "web",
] as const;

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: packages.map((pkg) => ({
      test: {
        name: pkg,
        root: `packages/${pkg}`,
        include: ["src/**/*.test.ts"],
        passWithNoTests: true,
        environment: pkg === "web" ? "happy-dom" : "node",
      },
    })),
  },
});
