import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
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
      include: ['tests/renderer/**/*.test.ts']
    }
  }
])
