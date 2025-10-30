// Extend the root Prettier configuration
const baseConfig = require('../../.prettierrc.cjs');

module.exports = {
  ...baseConfig,
  // SDK package specific overrides (stricter formatting for published code)
  printWidth: 90, // Slightly narrower for better readability in docs
  singleQuote: true,
  trailingComma: 'all',

  overrides: [
    ...baseConfig.overrides,
    {
      files: ['src/**/*.ts'],
      options: {
        // Consistent formatting for TypeScript SDK files
        printWidth: 90,
        singleQuote: true,
      },
    },
  ],
};
