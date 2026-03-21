import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import-x";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    plugins: {
      "import-x": importPlugin,
    },
    rules: {
      "import-x/no-cycle": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          project: "packages/*/tsconfig.json",
        },
      },
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "vitest.config.ts", "eslint.config.mjs"],
  }
);
