import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { resolveWithinRoot } from './paths'
import type { WriteReceipt } from '../../shared/ipc-contract'

export function writeFile(root: string, relativePath: string, content: string): WriteReceipt {
  const { resolved, relative } = resolveWithinRoot(root, relativePath)

  const targetDir = path.dirname(resolved)
  const targetName = path.basename(resolved)
  const randomSuffix = crypto.randomBytes(6).toString('hex')
  const tempName = `.${targetName}.tmp-${randomSuffix}`
  const tempPath = path.join(targetDir, tempName)

  try {
    fs.writeFileSync(tempPath, content, { encoding: 'utf-8', flag: 'wx' })
    const fd = fs.openSync(tempPath, 'r+')
    fs.fsyncSync(fd)
    fs.closeSync(fd)

    fs.renameSync(tempPath, resolved)

    const stat = fs.statSync(resolved)
    return { mtimeMs: stat.mtimeMs, size: stat.size }
  } catch (e: unknown) {
    try { fs.unlinkSync(tempPath) } catch { /* best effort cleanup */ }

    if (e instanceof Error) {
      const errno = e as NodeJS.ErrnoException
      if (errno.code === 'EBUSY' || errno.code === 'EPERM' || errno.code === 'EACCES') {
        throw Object.assign(new Error('File is locked by another program'), {
          code: 'LOCKED'
        })
      }
      if (errno.code === 'ENOSPC') {
        throw Object.assign(new Error('Disk full'), { code: 'IO' })
      }
    }
    throw Object.assign(new Error('Failed to write file'), { code: 'IO' })
  }
}
