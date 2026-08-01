import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, createFile, moveEntry } from '../../src/main/fs/mutate'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `ame-mutate-${Date.now()}-${Math.random().toString(36).slice(2)}`)
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
})
