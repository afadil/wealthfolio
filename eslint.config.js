import { createBaseConfig } from "./eslint.base.config.js";

export default [
  // Global ignores for root workspace
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/**",
      "src-core/**",
      "src-server/**",
      "*.config.js",
      "*.config.ts",
      "*.config.d.ts",
      "coverage/**",
      "public/**",
      "**/*.d.ts",
      "**/recharts/**",
      "**/react-qr-code/**",
      "src-tauri/gen/**",
      // Local data and embedded addon bundles
      "db/**",
      // Let workspaces handle their own linting
      "addons/**",
      "packages/**",
      // Additional ignores for generated/vendor files
      "src/lib/recharts-patch.ts",
      "src/lib/react-qr-code-patch.ts",
      // Test and build artifacts
      "playwright-report/**",
      "test-results/**",
      "scripts/**",
      "e2e-tests/**",
      "target/**",
    ],
  },

  // Use base config for main app
  ...createBaseConfig({
    includeReact: true,
    includeTanstackQuery: true,
    includeReactRefresh: true,
    tsconfigPath: ["./tsconfig.json", "./tsconfig.node.json"],
  }),
];
