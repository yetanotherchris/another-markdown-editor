import * as fs from 'fs'
import * as path from 'path'
import { resolveDirectory, resolveFile } from './paths'
import type { DirEntry, OpenedFile } from '../../shared/ipc-contract'

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
