// Extend the root Prettier configuration
const baseConfig = require("../../.prettierrc.cjs");

module.exports = {
  ...baseConfig,
  // UI package specific overrides
  overrides: [
    ...baseConfig.overrides,
    {
      files: ["src/components/**/*.tsx"],
      options: {
        // Slightly more relaxed for component files
        printWidth: 120,
      },
    },
  ],
};
