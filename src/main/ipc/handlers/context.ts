import * as path from 'path'
import * as fs from 'fs'
import { resolveWithinRoot } from '../../fs/paths'
import { readFile } from '../../fs/read'
import {
  loadRecentItems,
  saveRecentItems,
  recordRecentItem,
  removeRecentItem
} from '../../recentItems'
import { recentItemsConfigPath } from '../../recentItemsPath'
import { reportRecentItemsWarning, notifyRecentItemsOk } from '../../recentItemsWarning'
import { scrubAbsolutePaths } from '../../scrubPaths'
import type { WorkspaceState } from '../../workspace'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import type {
  Result,
  DirEntry,
  OpenedFile,
  ErrorCode,
  EntryKind,
  RecentKind
} from '../../../shared/ipc-contract'

/**
 * Shared state and helpers for the split IPC handler modules (spec 017,
 * contracts/main.md §Shared context). The module-level workspace/allowClose
 * state that handlers.ts used to own lives here so every `register*` module
 * sees the same instance. Helper bodies are moved verbatim from the old
 * handlers.ts — only the module boundary changed (FR-005).
 */

export const ctx = {
  workspaceState: null as WorkspaceState | null,
  workspaceRoot: null as string | null,
  allowClose: false,
  quitRequestPending: false,
  approvedRendererUrl: null as string | null
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function err(
  code: ErrorCode,
  message: string
): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code, message }
}

export function isAuthorizedRenderer(event: IpcMainInvokeEvent, window: BrowserWindow): boolean {
  if (event.sender !== window.webContents || !ctx.approvedRendererUrl) return false
  const senderUrl = event.senderFrame?.url
  if (!senderUrl) return false
  if (ctx.approvedRendererUrl.startsWith('file:')) return senderUrl === ctx.approvedRendererUrl
  try {
    return new URL(senderUrl).origin === new URL(ctx.approvedRendererUrl).origin
  } catch {
    return false
  }
}

export function sanitizeError(e: unknown, workspaceRootPath: string | null): string {
  if (!(e instanceof Error)) return 'Unknown error'
  let msg = e.message
  if (workspaceRootPath) {
    msg = msg.replace(
      new RegExp(workspaceRootPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      '<workspace>'
    )
  }
  // Principle II: NEVER leak an absolute path into a renderer-visible error —
  // run the absolute-path scrub unconditionally. With a workspace open only
  // the CURRENT root is otherwise scrubbed, so a failure while preparing a
  // dialog-chosen folder or committing a recent folder located elsewhere
  // (EACCES/ENOENT on `C:\Users\...\secret`) would pass the raw path through.
  return scrubAbsolutePaths(msg)
}

export function toAppError(e: unknown): { code: ErrorCode; message: string } {
  if (!(e instanceof Error)) return { code: 'IO', message: 'Unknown error' }
  const errno = (e as NodeJS.ErrnoException).code
  if (errno === 'ENOENT') return { code: 'NOT_FOUND', message: 'File or directory not found' }
  if (errno === 'EACCES' || errno === 'EPERM')
    return { code: 'PERMISSION', message: 'Permission denied' }
  if (errno === 'EEXIST') return { code: 'CONFLICT', message: 'Already exists' }
  const appCode = (e as { code?: ErrorCode }).code
  if (appCode && ERROR_CODES.has(appCode)) return { code: appCode, message: e.message }
  return { code: 'IO', message: e.message }
}

const ERROR_CODES = new Set<ErrorCode>([
  'OUTSIDE_WORKSPACE',
  'NOT_FOUND',
  'CONFLICT',
  'PERMISSION',
  'LOCKED',
  'TOO_LARGE',
  'NOT_TEXT',
  'TRASH_UNAVAILABLE',
  'NO_WORKSPACE',
  'IO'
])

export function ensureString(val: unknown, name: string): asserts val is string {
  if (typeof val !== 'string') {
    throw Object.assign(new Error(`${name} must be a string`), { code: 'IO' as ErrorCode })
  }
}

export function validateKind(val: unknown): asserts val is EntryKind {
  if (val !== 'file' && val !== 'directory') {
    throw Object.assign(new Error('kind must be "file" or "directory"'), {
      code: 'IO' as ErrorCode
    })
  }
}

export function withWorkspace<T>(fn: () => T): Result<T> {
  if (!ctx.workspaceRoot) {
    return err('NO_WORKSPACE', 'No workspace is open')
  }
  try {
    return ok(fn())
  } catch (e: unknown) {
    const appErr = toAppError(e)
    return err(appErr.code, sanitizeError(e, ctx.workspaceRoot))
  }
}

export function resolveAbsolutePath(root: string, absolutePath: string): string | null {
  try {
    const realFile = fs.realpathSync(absolutePath)
    const relative = path.relative(root, realFile)
    const segments = relative.split(path.sep)
    if (!relative || segments[0] === '..' || path.isAbsolute(relative)) {
      return null
    }
    return relative.split(path.sep).join('/')
  } catch {
    return null
  }
}

export function validateShape(
  obj: unknown,
  requiredKeys: string[],
  allowedKeys = requiredKeys
): void {
  if (!obj || typeof obj !== 'object') {
    throw Object.assign(new Error('Invalid IPC request: expected an object'), {
      code: 'IO' as ErrorCode
    })
  }
  for (const key of requiredKeys) {
    if (!(key in (obj as Record<string, unknown>))) {
      throw Object.assign(new Error(`Missing required field: ${key}`), { code: 'IO' as ErrorCode })
    }
  }
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      throw Object.assign(new Error(`Unexpected field: ${key}`), { code: 'IO' as ErrorCode })
    }
  }
}

// ---- spec-004 recent-items helpers (moved from handlers.ts) ----

// The renderer may only open a path main itself recorded (research R4):
// the recent-open handlers re-validate against the persisted list before any
// filesystem access.
export function isRecentEntry(path_: string, kind: RecentKind): boolean {
  return loadRecentItems(recentItemsConfigPath()).some((i) => i.path === path_ && i.kind === kind)
}

// FR-011: a persistence failure must NEVER fail the open it follows
// (FR-002/003) or delete a still-valid entry. Record/remove are best-effort —
// on a save failure the in-memory list cannot be persisted, the failure is
// reported quietly, and the open continues.
export function recordRecent(path_: string, kind: RecentKind, name: string): void {
  const configPath = recentItemsConfigPath()
  const items = loadRecentItems(configPath)
  try {
    saveRecentItems(
      configPath,
      recordRecentItem(items, {
        path: path_,
        kind,
        name,
        lastOpenedAt: Date.now()
      })
    )
    notifyRecentItemsOk()
  } catch (e: unknown) {
    reportRecentItemsWarning(e, 'save')
  }
}

export function removeRecent(path_: string, kind: RecentKind): void {
  const configPath = recentItemsConfigPath()
  const items = loadRecentItems(configPath)
  try {
    saveRecentItems(configPath, removeRecentItem(items, path_, kind))
    notifyRecentItemsOk()
  } catch (e: unknown) {
    reportRecentItemsWarning(e, 'save')
  }
}

/** Realpath-canonical form of an absolute path for recording (FR-006: raw
 *  dialog spellings and realpath-resolved spellings of the same file must
 *  dedupe). Falls back to `path.resolve` when the target is already gone. */
export function canonicalPath(p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

// Opens a file by absolute path, mirroring the dialog handler: when the file
// sits inside the current workspace the response carries the workspace-
// relative path and the parent is watched; otherwise the content is read
// directly with a `path: null` response.
export function openFileFromPath(filePath: string): OpenedFile {
  // Research R4 step 2: confirm the target still exists and has the right
  // type — a recorded 'file' whose path was replaced by a directory must not
  // be read as text (EISDIR would otherwise surface as a bare IO error).
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) {
    throw Object.assign(new Error('Target is not a file'), { code: 'NOT_TEXT' as ErrorCode })
  }

  if (ctx.workspaceRoot) {
    const relativePath = resolveAbsolutePath(ctx.workspaceRoot, filePath)
    if (relativePath) {
      const opened = readFile(ctx.workspaceRoot, relativePath)
      const parent = relativePath.includes('/')
        ? relativePath.split('/').slice(0, -1).join('/')
        : '.'
      ctx.workspaceState?.watchDir(parent)
      return opened
    }
  }

  const buffer = fs.readFileSync(filePath)

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw Object.assign(new Error('File is not valid UTF-8 text'), {
      code: 'NOT_TEXT' as ErrorCode
    })
  }

  return {
    path: null,
    name: path.basename(filePath),
    content: buffer.toString('utf-8'),
    mtimeMs: stat.mtimeMs,
    size: stat.size
  }
}

/** Path resolution helper re-exported for the handler modules. */
export { resolveWithinRoot }

/** Directory-entry type re-exported for the handler modules. */
export type { DirEntry }
