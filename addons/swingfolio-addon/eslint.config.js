import { createBaseConfig } from "../../eslint.base.config.js";

export default [
  // Addon-specific ignores
  {
    ignores: ["dist/**", "node_modules/**"],
  },

  // Use base config with addon-specific options
  ...createBaseConfig({
    includeReact: true,
    includeTanstackQuery: true, // Addons can use queries
    includeReactRefresh: true, // Needed for development
    tsconfigPath: "./tsconfig.json",
  }),

  // Addon-specific rules
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Add any addon-specific rules here
      // e.g., stricter rules for addon code
    },
  },
];
