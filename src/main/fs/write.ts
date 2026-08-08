import * as fs from 'fs'
import { resolveWithinRoot } from './paths'
import { atomicWrite } from './atomicWrite'
import type { WriteReceipt } from '../../shared/ipc-contract'

export function writeFile(root: string, relativePath: string, content: string): WriteReceipt {
  const { resolved } = resolveWithinRoot(root, relativePath)

  try {
    atomicWrite(resolved, content)

    const stat = fs.statSync(resolved)
    return { mtimeMs: stat.mtimeMs, size: stat.size }
  } catch (e: unknown) {
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
