// Extend the root Prettier configuration
const rootConfig = require("../../.prettierrc.cjs");
const baseConfig = { ...rootConfig };
delete baseConfig.plugins;

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
      },
    },
  ],
};
