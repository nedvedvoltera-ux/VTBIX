import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,ts}'],
    environment: 'node',
    reporters: ['default'],
    coverage: {
      include: ['server/**/*.js', 'src/utils/**/*.ts', 'src/data/**/*.ts'],
      exclude: ['server/index.js', 'server/db.js'],
    },
  },
})
