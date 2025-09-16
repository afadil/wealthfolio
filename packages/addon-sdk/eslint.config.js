import { createBaseConfig } from '../../eslint.base.config.js';

export default [
  // Package-specific ignores
  {
    ignores: ['dist/**', 'node_modules/**', 'tsup.config.ts'],
  },

  // Use base config with SDK-specific options
  ...createBaseConfig({
    includeReact: true,
    includeTanstackQuery: false, // SDK package doesn't need query rules
    includeReactRefresh: false, // Not needed for library
    tsconfigPath: './tsconfig.json',
  }),

  // SDK-specific rules
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Stricter rules for SDK code since it's published
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      // Ensure proper exports
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: {
            direct: false,
            named: false,
            defaultFrom: false,
            namedFrom: false,
            namespaceFrom: false,
          },
        },
      ],
    },
  },
];
