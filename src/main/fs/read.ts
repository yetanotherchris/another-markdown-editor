import * as fs from 'fs'
import * as path from 'path'
import { resolveDirectory, resolveFile, resolveWithinRoot } from './paths'
import type { DirEntry, OpenedFile, EntryInfo } from '../../shared/ipc-contract'

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])

export function isMarkdown(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase()
  return MARKDOWN_EXTENSIONS.has(ext)
}

export function readDir(root: string, relativePath: string): DirEntry[] {
  const { resolved } = resolveDirectory(root, relativePath)

  const entries = fs.readdirSync(resolved, { withFileTypes: true })

  const result: DirEntry[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      result.push({
        path: path.posix.join(relativePath || '.', entry.name),
        name: entry.name,
        kind: 'directory'
      })
    } else if (entry.isFile() && isMarkdown(entry.name)) {
      result.push({
        path: path.posix.join(relativePath || '.', entry.name),
        name: entry.name,
        kind: 'file'
      })
    }
  }

  result.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return result
}

export function readFile(root: string, relativePath: string): OpenedFile {
  const { resolved, relative } = resolveFile(root, relativePath)

  const buffer = fs.readFileSync(resolved)
  const stat = fs.statSync(resolved)

  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    decoder.decode(buffer)
  } catch {
    throw Object.assign(new Error('File is not valid UTF-8 text'), { code: 'NOT_TEXT' })
  }

  const content = buffer.toString('utf-8')
  const name = path.basename(relative)

  return {
    path: relative,
    name,
    content,
    mtimeMs: stat.mtimeMs,
    size: stat.size
  }
}

/**
 * FR-025/FR-029b: describe an entry for a delete confirmation. For folders,
 * scans the subtree for non-markdown files without following symlinks, so the
 * confirmation can warn about contents the tree never shows.
 */
export function describeEntry(root: string, relativePath: string): EntryInfo {
  const { resolved } = resolveWithinRoot(root, relativePath)
  const stat = fs.statSync(resolved)

  if (!stat.isDirectory()) {
    return { kind: 'file', isEmpty: false, hasHiddenFiles: false }
  }

  const scan = (dirPath: string): { total: number; hidden: number } => {
    let total = 0
    let hidden = 0
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return { total, hidden }
    }
    for (const entry of entries) {
      total++
      if (entry.isDirectory()) {
        // Real directories only: symlinked directories are never shown in the
        // tree (readDir filters them out) and are not recursed, so an external
        // target or a symlink loop cannot be scanned.
        const nested = scan(path.join(dirPath, entry.name))
        total += nested.total
        hidden += nested.hidden
      } else if (!(entry.isFile() && isMarkdown(entry.name))) {
        // Anything the tree does not show: non-markdown files, symlinks,
        // sockets, hidden dotfiles.
        hidden++
      }
    }
    return { total, hidden }
  }

  const result = scan(resolved)
  return {
    kind: 'directory',
    isEmpty: result.total === 0,
    hasHiddenFiles: result.hidden > 0
  }
}
