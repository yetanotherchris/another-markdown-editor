import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { trashEntry } from '../../src/main/fs/mutate'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `mm-trash-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('trashEntry', () => {
  let root: string

  beforeEach(() => {
    root = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(root)
  })

  it('permanent deletion removes a file', async () => {
    fs.writeFileSync(path.join(root, 'test.md'), '# test')
    const result = await trashEntry(root, 'test.md', true)
    expect(result.trashed).toBe(false)
    expect(fs.existsSync(path.join(root, 'test.md'))).toBe(false)
  })

  it('permanent deletion removes a directory recursively', async () => {
    fs.mkdirSync(path.join(root, 'subdir'))
    fs.writeFileSync(path.join(root, 'subdir', 'inner.md'), '# inner')
    const result = await trashEntry(root, 'subdir', true)
    expect(result.trashed).toBe(false)
    expect(fs.existsSync(path.join(root, 'subdir'))).toBe(false)
  })

  it('trash operation surfaces TRASH_UNAVAILABLE or succeeds', async () => {
    fs.writeFileSync(path.join(root, 'test.md'), '# test')
    try {
      const result = await trashEntry(root, 'test.md')
      expect(result.trashed).toBe(true)
      expect(fs.existsSync(path.join(root, 'test.md'))).toBe(false)
    } catch (e: unknown) {
      const err = e as { code?: string }
      expect(err.code).toBe('TRASH_UNAVAILABLE')
    }
  })

  it('rejects path outside root', async () => {
    await expect(trashEntry(root, '../outside.md', true)).rejects.toThrow()
  })
})
