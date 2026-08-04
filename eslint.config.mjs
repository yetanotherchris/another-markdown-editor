import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['fs', 'fs/promises', 'path', 'os', 'child_process', 'electron'],
            message: 'Node and Electron modules are only allowed in src/main/. Use the preload API instead.'
          }
        ]
      }],
      'no-restricted-globals': ['error', {
        name: 'require',
        message: 'Use import syntax instead of require.'
      }]
    }
  },
  {
    files: ['src/main/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off'
    }
  },
  {
    files: ['src/preload/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off'
    }
  },
  {
    files: ['tests/main/**/*.ts', 'tests/e2e/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off'
    }
  },
  {
    files: ['tests/release/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off'
    }
  },
  {
    files: ['tests/renderer/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off'
    }
  },
  {
    files: ['*.config.{ts,js}', 'vitest.workspace.ts'],
    rules: {
      'no-restricted-imports': 'off'
    }
  },
  {
    ignores: ['out/', 'node_modules/', 'dist/']
  }
)
