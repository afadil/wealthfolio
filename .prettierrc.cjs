module.exports = {
  arrowParens: 'always',
  bracketSameLine: false,
  bracketSpacing: true,
  embeddedLanguageFormatting: 'auto',
  endOfLine: 'lf',
  htmlWhitespaceSensitivity: 'css',
  insertPragma: false,
  jsxSingleQuote: false,
  printWidth: 100,
  proseWrap: 'always',
  quoteProps: 'as-needed',
  requirePragma: false,
  semi: true,
  singleAttributePerLine: false,
  singleQuote: true,
  trailingComma: 'all',
  useTabs: false,
  //tabWidth: 1,
  overrides: [
    {
      files: ['**/*.json'],
      options: {
        useTabs: false,
      },
    },
  ],
  plugins: ['prettier-plugin-tailwindcss'],
};
