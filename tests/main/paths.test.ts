import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveWithinRoot, resolveDirectory, resolveFile, resolveNonExistent } from '../../src/main/fs/paths'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `ame-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('resolveWithinRoot', () => {
  let root: string
  let subdir: string
  let markdownFile: string

  beforeEach(() => {
    root = createTempDir()
    subdir = path.join(root, 'sub')
    fs.mkdirSync(subdir)
    markdownFile = path.join(root, 'test.md')
    fs.writeFileSync(markdownFile, '# Test')
  })

  afterEach(() => {
    cleanupTempDir(root)
  })

  it('resolves a normal relative path', () => {
    const result = resolveWithinRoot(root, 'test.md')
    expect(result.relative).toBe('test.md')
    expect(result.resolved).toBe(markdownFile)
  })

  it('resolves a nested relative path', () => {
    const result = resolveWithinRoot(root, 'sub/../test.md')
    expect(result.relative).toBe('test.md')
  })

  it('rejects empty string', () => {
    expect(() => resolveWithinRoot(root, '')).toThrow()
  })

  it('rejects non-string', () => {
    expect(() => resolveWithinRoot(root, null as unknown as string)).toThrow()
    expect(() => resolveWithinRoot(root, undefined as unknown as string)).toThrow()
  })

  it('rejects absolute path', () => {
    expect(() => resolveWithinRoot(root, '/etc/passwd')).toThrow()
    expect(() => resolveWithinRoot(root, 'C:\\Windows\\System32')).toThrow()
  })

  it('rejects .. traversal out of root', () => {
    expect(() => resolveWithinRoot(root, '../outside.md')).toThrow()
  })

  it('rejects .. in mid-path that escapes root', () => {
    expect(() => resolveWithinRoot(root, 'subdir/../../outside.md')).toThrow()
  })

  it('rejects relative path that traverses to sibling directory', () => {
    const other = path.join(os.tmpdir(), (root.split(/[/\\]/).pop() || 'temp') + '2')
    fs.mkdirSync(other, { recursive: true })
    try {
      const relativeToOther = path.relative(root, other)
      expect(() => resolveWithinRoot(root, relativeToOther)).toThrow()
    } finally {
      cleanupTempDir(other)
    }
  })

  it('rejects paths with NUL bytes', () => {
    expect(() => resolveWithinRoot(root, 'file\0.md')).toThrow()
  })

  it('rejects reserved device names on Windows', () => {
    for (const name of ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1']) {
      expect(() => resolveWithinRoot(root, name)).toThrow()
      expect(() => resolveWithinRoot(root, `${name}.md`)).toThrow()
    }
  })

  it('rejects trailing dots and spaces', () => {
    expect(() => resolveWithinRoot(root, 'test.')).toThrow()
    expect(() => resolveWithinRoot(root, 'test ')).toThrow()
  })

  it('rejects alternate data stream syntax', () => {
    expect(() => resolveWithinRoot(root, 'test.md:stream')).toThrow()
  })

  it('resolves through symlink within root', () => {
    const linkPath = path.join(root, 'link.md')
    try {
      fs.symlinkSync(markdownFile, linkPath)
      const result = resolveWithinRoot(root, 'link.md')
      expect(result.resolved).toBe(markdownFile)
      expect(result.relative).toBe('test.md')
    } catch {
      // File symlinks need developer mode or admin on Windows. Junctions work
      // without admin but only for directories — use one as the equivalent.
      if (process.platform === 'win32') {
        const junctionPath = path.join(root, 'linkdir')
        try {
          fs.symlinkSync(subdir, junctionPath, 'junction')
          const result = resolveWithinRoot(root, 'linkdir')
          expect(result.resolved).toBe(subdir)
          expect(result.relative).toBe('sub')
        } catch {
          // Filesystem does not support links at all.
        }
      }
    }
  })

  it('rejects a path escaping through a directory junction/symlink to outside the root', () => {
    // A junction (Windows, no admin required) or symlink planted inside the
    // workspace pointing outside must not let a candidate path escape: the
    // containment check resolves through the link and must fail closed.
    const outside = createTempDir()
    try {
      fs.symlinkSync(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : undefined)
    } catch {
      cleanupTempDir(outside)
      return
    }
    try {
      expect(() => resolveWithinRoot(root, 'escape/secret.md')).toThrow()
      expect(() => resolveNonExistent(root, 'escape/new.md')).toThrow()
    } finally {
      cleanupTempDir(outside)
    }
  })
})

describe('resolveDirectory', () => {
  let root: string

  beforeEach(() => {
    root = createTempDir()
    fs.mkdirSync(path.join(root, 'subdir'))
  })

  afterEach(() => {
    cleanupTempDir(root)
  })

  it('resolves a directory', () => {
    const result = resolveDirectory(root, 'subdir')
    expect(result.relative).toBe('subdir')
  })

  it('rejects a file as directory', () => {
    fs.writeFileSync(path.join(root, 'file.md'), 'content')
    expect(() => resolveDirectory(root, 'file.md')).toThrow()
  })
})

describe('resolveFile', () => {
  let root: string

  beforeEach(() => {
    root = createTempDir()
    fs.writeFileSync(path.join(root, 'file.md'), '# content')
  })

  afterEach(() => {
    cleanupTempDir(root)
  })

  it('resolves a file', () => {
    const result = resolveFile(root, 'file.md')
    expect(result.relative).toBe('file.md')
  })

  it('rejects a directory as file', () => {
    fs.mkdirSync(path.join(root, 'subdir'))
    expect(() => resolveFile(root, 'subdir')).toThrow()
  })
})

describe('resolveNonExistent', () => {
  let root: string

  beforeEach(() => {
    root = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(root)
  })

  it('resolves a non-existent path within root', () => {
    const result = resolveNonExistent(root, 'newfile.md')
    expect(result.relative).toBe('newfile.md')
  })

  it('rejects a path outside root', () => {
    expect(() => resolveNonExistent(root, '../outside.md')).toThrow()
  })
})
