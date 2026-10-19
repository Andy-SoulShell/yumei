/** 统一服务端与浏览器的静态检查规则，并启用 React Hooks 校验。 */

import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    ".pnpm-store/**",
    "dist/**",
    "build/**",
    "coverage/**",
    "data/**",
    "drizzle/meta/**",
    "tmp/**",
    "temp/**",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    extends: [js.configs.recommended],
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
    rules: {
      // SDK 数据与现有测试替身允许显式 any；strict 仍禁止隐式 any。
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: [
      "*.{js,ts}",
      "server/**/*.{js,ts}",
      "shared/**/*.ts",
      "drizzle/**/*.ts",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: ["client/public/**/*.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  prettier,
]);
