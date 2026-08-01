import * as fs from 'fs'
import * as path from 'path'
import { shell } from 'electron'
import { resolveWithinRoot, resolveNonExistent } from './paths'
import type { DirEntry, TrashReceipt } from '../../shared/ipc-contract'

export function mkdir(root: string, parentRelativePath: string, name: string): DirEntry {
  const { resolved: parentResolved } = resolveWithinRoot(root, parentRelativePath)

  const newPath = path.join(parentResolved, name)
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
  const { resolved: parentResolved } = resolveWithinRoot(root, parentRelativePath)

  const newPath = path.join(parentResolved, name)
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
  const { resolved: toResolved, relative: toRelative } = resolveNonExistent(root, toRelativePath)

  if (fs.existsSync(toResolved)) {
    throw Object.assign(new Error('Target already exists'), { code: 'CONFLICT' })
  }

  const fromReal = fs.realpathSync(fromResolved)
  const toReal = path.resolve(toResolved)

  if (toReal.startsWith(fromReal + path.sep) || toReal === fromReal) {
    throw Object.assign(new Error('Cannot move into own descendant'), { code: 'CONFLICT' })
  }

  fs.renameSync(fromResolved, toResolved)

  const stat = fs.statSync(toResolved)
  return {
    path: toRelative,
    name: path.basename(toRelative),
    kind: stat.isDirectory() ? 'directory' : 'file'
  }
}

export async function trashEntry(root: string, relativePath: string, permanent?: boolean): Promise<TrashReceipt> {
  const { resolved } = resolveWithinRoot(root, relativePath)

  if (permanent) {
    const stat = fs.statSync(resolved)
    if (stat.isDirectory()) {
      fs.rmSync(resolved, { recursive: true, force: true })
    } else {
      fs.unlinkSync(resolved)
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
