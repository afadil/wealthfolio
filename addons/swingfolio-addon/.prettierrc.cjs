// Extend the root Prettier configuration
const baseConfig = require("../../.prettierrc.cjs");

module.exports = {
  ...baseConfig,
  // Addon specific overrides (same as main app for consistency)
  overrides: [
    ...baseConfig.overrides,
    {
      files: ["src/**/*.{ts,tsx}"],
      options: {
        // Consistent with main app formatting
        printWidth: 100,
        singleQuote: true,
      },
    },
  ],
};
