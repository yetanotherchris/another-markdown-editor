import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFile } from '../src/main/fs/write'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `ame-write-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('writeFile', () => {
  let root: string

  beforeEach(() => {
    root = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(root)
  })

  it('writes a file atomically', () => {
    const result = writeFile(root, 'test.md', '# Hello World')
    expect(result.size).toBeGreaterThan(0)
    expect(result.mtimeMs).toBeGreaterThan(0)

    const content = fs.readFileSync(path.join(root, 'test.md'), 'utf-8')
    expect(content).toBe('# Hello World')
  })

  it('overwrites an existing file atomically', () => {
    fs.writeFileSync(path.join(root, 'test.md'), '# Old content')
    const result = writeFile(root, 'test.md', '# New content')

    const content = fs.readFileSync(path.join(root, 'test.md'), 'utf-8')
    expect(content).toBe('# New content')
  })

  it('only final file exists, not temp file', () => {
    writeFile(root, 'test.md', '# content')

    const entries = fs.readdirSync(root)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toBe('test.md')
  })

  it('rejects path outside root', () => {
    expect(() => writeFile(root, '../outside.md', 'content')).toThrow()
  })

  it('creates parent directories if needed', () => {
    expect(() => writeFile(root, 'nonexistent/test.md', 'content')).toThrow()
  })

  it('handles empty content', () => {
    const result = writeFile(root, 'empty.md', '')
    expect(result.size).toBe(0)

    const content = fs.readFileSync(path.join(root, 'empty.md'), 'utf-8')
    expect(content).toBe('')
  })

  it('handles unicode content', () => {
    writeFile(root, 'unicode.md', 'Hello 世界 🌍')
    const content = fs.readFileSync(path.join(root, 'unicode.md'), 'utf-8')
    expect(content).toBe('Hello 世界 🌍')
  })
})
