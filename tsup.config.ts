import { defineConfig } from 'tsup';

export default defineConfig([
  // Main library
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    target: 'node18',
    outDir: 'dist',
    external: ['bun:sqlite'],
  },
  // CLI binary
  {
    entry: ['src/bin/memorai.ts'],
    format: ['esm'],
    splitting: false,
    sourcemap: true,
    target: 'node18',
    outDir: 'dist/bin',
    banner: {
      js: '#!/usr/bin/env node',
    },
    external: ['bun:sqlite'],
  },
]);
