import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['tests/main/**/*.test.ts']
        }
      },
      {
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.ts', 'tests/renderer/**/*.test.tsx'],
          setupFiles: ['tests/renderer/setup.ts']
        }
      }
    ]
  }
})
