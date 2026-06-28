import { defineConfig } from 'vitest/config';
import { readFile } from 'node:fs/promises';
import { resolve as pathResolve } from 'node:path';

/**
 * Vite plugin: load `.md` imports as UTF-8 string exports.
 *
 * Mirrors wrangler's `[[rules]] type = "Text"` for the test runner so the
 * same `import SYSTEM_PROMPT from '../prompts/palmVision.md'` works under
 * both bundlers without adding a dependency (issue #191).
 */
function rawTextImports() {
  return {
    name: 'palmi-raw-text-imports',
    enforce: 'pre' as const,
    async load(id: string) {
      if (!/\.(md)$/.test(id)) return null;
      const contents = await readFile(pathResolve(id), 'utf8');
      return `export default ${JSON.stringify(contents)};`;
    },
  };
}

export default defineConfig({
  plugins: [rawTextImports()],
  test: {
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
