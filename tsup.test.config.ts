import { defineConfig } from 'tsup';

// Baut die Tests (node:test) nach .test-build/, damit sie ohne weitere
// Dependency (tsx, vitest) unter Node 20 laufen.
export default defineConfig({
  entry: ['test/**/*.test.ts'],
  format: ['esm'],
  outDir: '.test-build',
  target: 'node20',
  clean: true,
  splitting: false,
  sourcemap: true,
  shims: false,
  dts: false,
  silent: true,
  // Sonst macht tsup aus 'node:test' ein 'test' (kein Alias ohne Präfix).
  removeNodeProtocol: false,
});
