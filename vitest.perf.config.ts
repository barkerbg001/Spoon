import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    include: ['tests/perf/**/*.perf.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 600_000,
    pool: 'forks'
  }
})
