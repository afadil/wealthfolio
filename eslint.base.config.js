import { fixupPluginRules } from "@eslint/compat";
import js from "@eslint/js";
import tanstackQuery from "@tanstack/eslint-plugin-query";
import prettierConfig from "eslint-config-prettier";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Shared ESLint configuration for all workspaces in the monorepo
 * Each workspace can extend this base config with their own specific rules
 */
export function createBaseConfig(options = {}) {
  const {
    includeReact = true,
    includeTanstackQuery = true,
    includeReactRefresh = true,
    tsconfigPath = "./tsconfig.json",
    additionalIgnores = [],
  } = options;

  return [
    // Base JavaScript config
    js.configs.recommended,

    // TypeScript type-checked configs (only apply to TS files)
    ...tseslint.configs.recommendedTypeChecked.map((config) => ({
      ...config,
      files: ["**/*.{ts,tsx}"],
    })),
    ...tseslint.configs.stylisticTypeChecked.map((config) => ({
      ...config,
      files: ["**/*.{ts,tsx}"],
    })),

    // TypeScript configuration
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        globals: {
          ...globals.browser,
          ...globals.es2020,
          ...globals.node,
        },
        parser: tseslint.parser,
        parserOptions: {
          ecmaFeatures: {
            jsx: true,
          },
          project: tsconfigPath,
          tsconfigRootDir: import.meta.dirname,
        },
      },
      plugins: {
        "@typescript-eslint": tseslint.plugin,
        ...(includeReact && { react }),
        ...(includeReact && { "react-hooks": fixupPluginRules(reactHooks) }),
        ...(includeReactRefresh && { "react-refresh": reactRefresh }),
        ...(includeTanstackQuery && { "@tanstack/query": tanstackQuery }),
      },
      rules: {
        // TypeScript rules
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_",
          },
        ],
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/unbound-method": "off",
        "@typescript-eslint/prefer-nullish-coalescing": "error",
        "@typescript-eslint/prefer-optional-chain": "error",
        "@typescript-eslint/no-unnecessary-type-assertion": "error",

        // Relaxed rules for better developer experience
        "@typescript-eslint/no-unsafe-assignment": "warn",
        "@typescript-eslint/no-unsafe-member-access": "warn",
        "@typescript-eslint/no-unsafe-call": "warn",
        "@typescript-eslint/no-unsafe-argument": "warn",
        "@typescript-eslint/no-unsafe-return": "warn",
        "@typescript-eslint/no-floating-promises": "off",
        "@typescript-eslint/require-await": "warn",

        // General rules
        "no-console": ["warn", { allow: ["warn", "error"] }],
        "prefer-const": "error",
        "no-var": "error",

        // React rules (if enabled)
        ...(includeReact && {
          ...react.configs.recommended.rules,
          ...react.configs["jsx-runtime"].rules,
          ...reactHooks.configs.recommended.rules,
          "react/prop-types": "off",
          "react/react-in-jsx-scope": "off",
          "react/jsx-uses-react": "off",
        }),

        // React Refresh rules (if enabled)
        ...(includeReactRefresh && {
          "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
        }),

        // TanStack Query rules (if enabled)
        ...(includeTanstackQuery && tanstackQuery.configs.recommended.rules),
      },
      settings: {
        ...(includeReact && {
          react: {
            version: "detect",
          },
        }),
      },
    },

    // JavaScript files configuration
    {
      files: ["**/*.{js,jsx,mjs,cjs}"],
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        globals: {
          ...globals.browser,
          ...globals.node,
        },
        parserOptions: {
          ecmaFeatures: {
            jsx: true,
          },
        },
      },
      plugins: {
        ...(includeReact && { react }),
        ...(includeReact && { "react-hooks": fixupPluginRules(reactHooks) }),
      },
      rules: {
        // General rules
        "no-console": ["warn", { allow: ["warn", "error"] }],
        "prefer-const": "error",
        "no-var": "error",

        // React rules (if enabled)
        ...(includeReact && {
          ...react.configs.recommended.rules,
          ...react.configs["jsx-runtime"].rules,
          ...reactHooks.configs.recommended.rules,
          "react/prop-types": "off",
          "react/react-in-jsx-scope": "off",
          "react/jsx-uses-react": "off",
        }),
      },
      settings: {
        ...(includeReact && {
          react: {
            version: "detect",
          },
        }),
      },
    },

    // Prettier config (must be last)
    prettierConfig,
  ];
}
