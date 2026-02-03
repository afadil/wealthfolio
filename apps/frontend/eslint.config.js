import { createBaseConfig } from "../../eslint.base.config.js";

export default [
  // Ignores for frontend
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "*.config.js",
      "*.config.ts",
      "*.config.d.ts",
      "coverage/**",
      "public/**",
      "**/*.d.ts",
      "**/recharts/**",
      "**/react-qr-code/**",
      "src/lib/recharts-patch.ts",
      "src/lib/react-qr-code-patch.ts",
    ],
  },

  // Use base config for frontend app
  ...createBaseConfig({
    includeReact: true,
    includeTanstackQuery: true,
    includeReactRefresh: true,
    tsconfigPath: ["./tsconfig.json", "./tsconfig.node.json"],
  }),
];
