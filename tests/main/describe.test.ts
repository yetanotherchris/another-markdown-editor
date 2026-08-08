import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { describeEntry } from '../../src/main/fs/read'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `mm-describe-${Date.now()}-${Math.random().toString(36).slice(2)}`)
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

  it('does not follow directory links when scanning, even into a loop', () => {
    // POSIX symlink or Windows junction (no admin needed). The link points
    // back at the scanned folder's parent, forming a cycle: a scan that
    // followed the link would recurse forever (stack overflow) and throw.
    const link = path.join(root, 'notes', 'link')
    fs.mkdirSync(path.join(root, 'notes'))
    try {
      fs.symlinkSync(root, link, process.platform === 'win32' ? 'junction' : undefined)
    } catch {
      // Link creation unsupported on this filesystem — nothing to verify.
      return
    }

    const info = describeEntry(root, 'notes')
    expect(info.kind).toBe('directory')
    // The link itself is hidden from the tree; it must be counted as hidden
    // without recursing into the cycle.
    expect(info.hasHiddenFiles).toBe(true)
    expect(info.isEmpty).toBe(false)
  })

  it('does not follow a markdown-named link, so it counts as hidden', () => {
    const outside = createTempDir()
    fs.writeFileSync(path.join(outside, 'secret.md'), 'secret')
    fs.mkdirSync(path.join(root, 'notes'))
    try {
      fs.symlinkSync(outside, path.join(root, 'notes', 'link.md'), process.platform === 'win32' ? 'junction' : undefined)
    } catch {
      cleanupTempDir(outside)
      return
    }

    const info = describeEntry(root, 'notes')
    // A markdown-named file would be visible — but this is a link, which the
    // tree never shows, so the scan must still report it as hidden without
    // reading through to the external target.
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
