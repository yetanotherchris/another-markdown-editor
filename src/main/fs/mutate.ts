import * as fs from 'fs'
import * as path from 'path'
import { shell } from 'electron'
import { resolveWithinRoot, resolveNonExistent } from './paths'
import { isMarkdown } from './read'
import type { DirEntry, TrashReceipt } from '../../shared/ipc-contract'

export function mkdir(root: string, parentRelativePath: string, name: string): DirEntry {
  const { resolved, relative } = resolveNonExistent(root, path.posix.join(parentRelativePath, name))

  if (fs.existsSync(resolved)) {
    throw Object.assign(new Error('Entry already exists'), { code: 'CONFLICT' })
  }

  fs.mkdirSync(resolved)

  return {
    path: relative,
    name,
    kind: 'directory'
  }
}

export function createFile(root: string, parentRelativePath: string, name: string): DirEntry {
  // FR-010: non-markdown files are hidden from the tree. Enforcing here too
  // (not only in the renderer) keeps the file from silently vanishing from
  // the explorer after creation.
  if (!isMarkdown(name)) {
    throw Object.assign(new Error('Files must have the .md or .markdown extension'), { code: 'IO' })
  }

  const { resolved, relative } = resolveNonExistent(root, path.posix.join(parentRelativePath, name))

  if (fs.existsSync(resolved)) {
    throw Object.assign(new Error('Entry already exists'), { code: 'CONFLICT' })
  }

  fs.writeFileSync(resolved, '', { flag: 'wx' })

  return {
    path: relative,
    name,
    kind: 'file'
  }
}

export function moveEntry(root: string, fromRelativePath: string, toRelativePath: string): DirEntry {
  const { resolved: fromResolved } = resolveWithinRoot(root, fromRelativePath)
  const { resolved: toResolved } = resolveNonExistent(root, toRelativePath)

  const fromStat = fs.statSync(fromResolved)

  // FR-010: renaming a file to a non-markdown name would make it vanish from
  // the tree. Enforced here as well as in the renderer — renderer-side checks
  // are never trusted.
  if (!fromStat.isDirectory() && !isMarkdown(path.basename(toRelativePath))) {
    throw Object.assign(new Error('Files must have the .md or .markdown extension'), { code: 'IO' })
  }

  const fromReal = fs.realpathSync(fromResolved)
  // The rename target is the *lexical* path: resolveNonExistent realpaths the
  // target, and for a case-only rename (alpha.md → ALPHA.md) realpath
  // canonicalises the case back to the source — the rename would then be a
  // no-op and the case change would be lost.
  const toLexical = path.resolve(root, toRelativePath)

  // Case-only rename on a case-insensitive filesystem: the target exists (it
  // is the same file) and must not be treated as a conflict.
  const caseOnlyRename = fs.existsSync(toResolved) &&
    fromReal.toLowerCase() === toLexical.toLowerCase()

  if (fs.existsSync(toResolved) && !caseOnlyRename) {
    throw Object.assign(new Error('Target already exists'), { code: 'CONFLICT' })
  }

  if (!caseOnlyRename) {
    const toReal = path.resolve(toResolved)
    if (toReal.startsWith(fromReal + path.sep) || toReal === fromReal) {
      throw Object.assign(new Error('Cannot move into own descendant'), { code: 'CONFLICT' })
    }
  }

  fs.renameSync(fromResolved, toLexical)

  const stat = fs.statSync(toLexical)
  return {
    path: toRelativePath,
    name: path.basename(toRelativePath),
    kind: stat.isDirectory() ? 'directory' : 'file'
  }
}

export async function trashEntry(root: string, relativePath: string, permanent?: boolean): Promise<TrashReceipt> {
  const { resolved } = resolveWithinRoot(root, relativePath)

  if (permanent) {
    // Async so a large recursive delete does not block the main process.
    const stat = await fs.promises.stat(resolved)
    if (stat.isDirectory()) {
      await fs.promises.rm(resolved, { recursive: true, force: true })
    } else {
      await fs.promises.unlink(resolved)
    }
    return { trashed: false }
  }

  try {
    await shell.trashItem(resolved)
    return { trashed: true }
  } catch {
    throw Object.assign(new Error('Cannot move to trash'), { code: 'TRASH_UNAVAILABLE' })
  }
}
