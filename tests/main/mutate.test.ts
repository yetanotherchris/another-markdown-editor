import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, createFile, moveEntry, trashEntry } from '../../src/main/fs/mutate'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `mm-mutate-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('mkdir', () => {
  let root: string

  beforeEach(() => {
    root = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(root)
  })

  it('creates a directory', () => {
    const result = mkdir(root, '.', 'newdir')
    expect(result.name).toBe('newdir')
    expect(result.kind).toBe('directory')

    expect(fs.existsSync(path.join(root, 'newdir'))).toBe(true)
    expect(fs.statSync(path.join(root, 'newdir')).isDirectory()).toBe(true)
  })

  it('rejects conflicting name', () => {
    fs.mkdirSync(path.join(root, 'exists'))
    expect(() => mkdir(root, '.', 'exists')).toThrow()
  })

  it('creates nested directory', () => {
    fs.mkdirSync(path.join(root, 'parent'))
    const result = mkdir(root, 'parent', 'child')
    expect(result.name).toBe('child')
    expect(fs.existsSync(path.join(root, 'parent', 'child'))).toBe(true)
  })

  it('rejects directory outside root', () => {
    expect(() => mkdir(root, '..', 'outside')).toThrow()
  })
})

describe('createFile', () => {
  let root: string

  beforeEach(() => {
    root = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(root)
  })

  it('creates a new empty file', () => {
    const result = createFile(root, '.', 'new.md')
    expect(result.name).toBe('new.md')
    expect(result.kind).toBe('file')

    const stat = fs.statSync(path.join(root, 'new.md'))
    expect(stat.isFile()).toBe(true)
    expect(stat.size).toBe(0)
  })

  it('rejects conflicting name', () => {
    fs.writeFileSync(path.join(root, 'exists.md'), 'content')
    expect(() => createFile(root, '.', 'exists.md')).toThrow()
  })

  it('rejects non-markdown file names (FR-010, main-side)', () => {
    expect(() => createFile(root, '.', 'notes.txt')).toThrow()
    expect(() => createFile(root, '.', 'notes')).toThrow()
  })

  it('rejects file outside root', () => {
    expect(() => createFile(root, '..', 'outside.md')).toThrow()
  })
})

describe('moveEntry', () => {
  let root: string

  beforeEach(() => {
    root = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(root)
  })

  it('renames a file', () => {
    fs.writeFileSync(path.join(root, 'old.md'), '# old')
    const result = moveEntry(root, 'old.md', 'new.md')
    expect(result.name).toBe('new.md')
    expect(result.path).toBe('new.md')
    expect(fs.existsSync(path.join(root, 'old.md'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'new.md'))).toBe(true)
  })

  it('renames a directory', () => {
    fs.mkdirSync(path.join(root, 'olddir'))
    const result = moveEntry(root, 'olddir', 'newdir')
    expect(result.name).toBe('newdir')
    expect(fs.existsSync(path.join(root, 'olddir'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'newdir'))).toBe(true)
  })

  it('rejects move to existing target', () => {
    fs.writeFileSync(path.join(root, 'a.md'), 'a')
    fs.writeFileSync(path.join(root, 'b.md'), 'b')
    expect(() => moveEntry(root, 'a.md', 'b.md')).toThrow()
  })

  it('rejects move into own descendant', () => {
    fs.mkdirSync(path.join(root, 'parent'))
    fs.mkdirSync(path.join(root, 'parent', 'child'))
    expect(() => moveEntry(root, 'parent', path.join('parent', 'child', 'nested'))).toThrow()
  })

  it('rejects move outside root', () => {
    fs.writeFileSync(path.join(root, 'a.md'), 'a')
    expect(() => moveEntry(root, 'a.md', '../outside.md')).toThrow()
  })

  it('rejects renaming a file to a non-markdown name (FR-010, main-side)', () => {
    fs.writeFileSync(path.join(root, 'a.md'), 'a')
    expect(() => moveEntry(root, 'a.md', 'a.txt')).toThrow()
    expect(() => moveEntry(root, 'a.md', 'b')).toThrow()
    // The file is untouched.
    expect(fs.existsSync(path.join(root, 'a.md'))).toBe(true)
  })

  it('allows renaming directories to any name', () => {
    fs.mkdirSync(path.join(root, 'olddir'))
    const result = moveEntry(root, 'olddir', 'newdir.txt')
    expect(result.name).toBe('newdir.txt')
    expect(fs.existsSync(path.join(root, 'newdir.txt'))).toBe(true)
  })

  it('is a no-op for an identical target path', () => {
    fs.writeFileSync(path.join(root, 'a.md'), 'a')
    const result = moveEntry(root, 'a.md', 'a.md')
    expect(result.path).toBe('a.md')
    expect(fs.readFileSync(path.join(root, 'a.md'), 'utf-8')).toBe('a')
  })

  it('allows a case-only rename (alpha.md → ALPHA.md)', () => {
    // On case-insensitive filesystems the target exists (it is the same
    // file) and must not be reported as a conflict. On case-sensitive ones
    // the target simply does not exist. Both must succeed.
    fs.writeFileSync(path.join(root, 'alpha.md'), '# alpha')
    const result = moveEntry(root, 'alpha.md', 'ALPHA.md')
    expect(result.path).toBe('ALPHA.md')
    expect(fs.readFileSync(path.join(root, 'ALPHA.md'), 'utf-8')).toBe('# alpha')
  })
})

describe('trashEntry', () => {
  let root: string

  beforeEach(() => {
    root = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(root)
  })

  it('permanently deletes a file when requested', async () => {
    fs.writeFileSync(path.join(root, 'a.md'), 'a')
    const receipt = await trashEntry(root, 'a.md', true)
    expect(receipt.trashed).toBe(false)
    expect(fs.existsSync(path.join(root, 'a.md'))).toBe(false)
  })

  it('permanently deletes a folder recursively when requested', async () => {
    fs.mkdirSync(path.join(root, 'dir'))
    fs.writeFileSync(path.join(root, 'dir', 'a.md'), 'a')
    fs.writeFileSync(path.join(root, 'dir', 'nested.txt'), 'x')
    const receipt = await trashEntry(root, 'dir', true)
    expect(receipt.trashed).toBe(false)
    expect(fs.existsSync(path.join(root, 'dir'))).toBe(false)
  })

  it('rejects a path outside the workspace', async () => {
    await expect(trashEntry(root, '../outside.md', true)).rejects.toThrow()
  })
})
