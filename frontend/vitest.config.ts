import { defineConfig } from 'vitest/config'

// Vitest is scoped to browser-independent pure logic (cursor mapping, sync,
// reconciliation) per TECH-007. The renderer glue (index.ts) and the editor
// integration are verified via AppTest / browser round-trip, not unit tests,
// so they are excluded from coverage. `passWithNoTests` keeps CI green until
// those pure modules (and their tests) land.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
})
