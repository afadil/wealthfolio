import { createBaseConfig } from "../../eslint.base.config.js";

export default [
  // Package-specific ignores
  {
    ignores: ["dist/**", "node_modules/**", "*.config.ts", "*.config.js"],
  },

  // Use base config with package-specific options
  ...createBaseConfig({
    includeReact: true,
    includeTanstackQuery: false, // UI package might not need query
    includeReactRefresh: false, // Not needed for library
    tsconfigPath: "./tsconfig.json",
  }),
];
