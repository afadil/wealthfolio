import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: {
    resolve: true,
  },
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'date-fns'],
  treeshake: true,
  splitting: false,
  minify: false, // Keep readable for development
  target: 'es2020',
  esbuildOptions(options) {
    options.alias = {
      '@/components': './src/components',
      '@/lib': './src/lib',
      '@wealthfolio/ui': './src'
    };
  },
});
