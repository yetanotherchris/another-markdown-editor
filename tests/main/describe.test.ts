import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { describeEntry } from '../../src/main/fs/read'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `ame-describe-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('describeEntry', () => {
  let root: string

  beforeEach(() => {
    root = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(root)
  })

  it('describes a file', () => {
    fs.writeFileSync(path.join(root, 'a.md'), '# a')
    const info = describeEntry(root, 'a.md')
    expect(info.kind).toBe('file')
    expect(info.isEmpty).toBe(false)
    expect(info.hasHiddenFiles).toBe(false)
  })

  it('describes an empty directory', () => {
    fs.mkdirSync(path.join(root, 'empty'))
    const info = describeEntry(root, 'empty')
    expect(info.kind).toBe('directory')
    expect(info.isEmpty).toBe(true)
    expect(info.hasHiddenFiles).toBe(false)
  })

  it('reports a directory with only visible markdown as having no hidden files', () => {
    fs.mkdirSync(path.join(root, 'notes'))
    fs.writeFileSync(path.join(root, 'notes', 'a.md'), '# a')
    fs.writeFileSync(path.join(root, 'notes', 'b.markdown'), '# b')
    fs.mkdirSync(path.join(root, 'notes', 'sub'))
    fs.writeFileSync(path.join(root, 'notes', 'sub', 'c.md'), '# c')

    const info = describeEntry(root, 'notes')
    expect(info.kind).toBe('directory')
    expect(info.isEmpty).toBe(false)
    expect(info.hasHiddenFiles).toBe(false)
  })

  it('detects hidden files at any depth, including inside nested folders', () => {
    fs.mkdirSync(path.join(root, 'notes'))
    fs.writeFileSync(path.join(root, 'notes', 'image.png'), 'binary')
    fs.mkdirSync(path.join(root, 'notes', 'sub'))
    fs.writeFileSync(path.join(root, 'notes', 'sub', 'data.txt'), 'text')

    const info = describeEntry(root, 'notes')
    expect(info.isEmpty).toBe(false)
    expect(info.hasHiddenFiles).toBe(true)
  })

  it('counts uppercase markdown extensions as visible', () => {
    fs.mkdirSync(path.join(root, 'notes'))
    fs.writeFileSync(path.join(root, 'notes', 'A.MD'), '# a')
    const info = describeEntry(root, 'notes')
    expect(info.hasHiddenFiles).toBe(false)
  })

  it('does not follow symlinks when scanning and counts them as hidden', () => {
    if (process.platform === 'win32') {
      // Symlink creation needs developer mode or admin on Windows; skip.
      return
    }
    const outside = createTempDir()
    fs.writeFileSync(path.join(outside, 'secret.md'), 'secret')
    fs.mkdirSync(path.join(root, 'notes'))
    fs.symlinkSync(outside, path.join(root, 'notes', 'link'))

    // The link itself is hidden from the tree. Recursing into it would be
    // unsafe (external target), and would not change this result, but the
    // scan must complete without error or escaping.
    const info = describeEntry(root, 'notes')
    expect(info.kind).toBe('directory')
    expect(info.hasHiddenFiles).toBe(true)
    expect(fs.existsSync(path.join(root, 'notes', 'link', 'secret.md'))).toBe(true)

    cleanupTempDir(outside)
  })

  it('counts a markdown-named symlink as hidden because the tree never shows symlinks', () => {
    if (process.platform === 'win32') return
    const outside = createTempDir()
    fs.writeFileSync(path.join(outside, 'secret.md'), 'secret')
    fs.mkdirSync(path.join(root, 'notes'))
    fs.symlinkSync(outside, path.join(root, 'notes', 'link.md'))

    const info = describeEntry(root, 'notes')
    expect(info.hasHiddenFiles).toBe(true)

    cleanupTempDir(outside)
  })

  it('rejects paths outside the workspace', () => {
    expect(() => describeEntry(root, '../outside')).toThrow()
  })

  it('throws NOT_FOUND for a missing entry', () => {
    expect(() => describeEntry(root, 'missing.md')).toThrow()
  })
})
