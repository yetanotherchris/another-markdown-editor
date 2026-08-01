import type { EntryInfo, EntryKind } from '../../shared/ipc-contract'
import type { DocumentState } from '../state/documents'

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])

export function parentPathOf(id: string): string {
  const lastSlash = id.lastIndexOf('/')
  if (lastSlash <= 0) return ''
  return id.slice(0, lastSlash)
}

export function entryName(id: string): string {
  const segments = id.split('/')
  return segments[segments.length - 1]
}

/** Same-directory rename target: `a/b.md` + `c.md` → `a/c.md`. */
export function renameTargetPath(fromPath: string, newName: string): string {
  const parent = parentPathOf(fromPath)
  return parent ? `${parent}/${newName}` : newName
}

/**
 * Drag-and-drop target for moving `fromPath` into `targetDirId`.
 * Returns null when the drop would not change the location (same parent).
 */
export function moveTargetPath(fromPath: string, targetDirId: string): string | null {
  const parent = parentPathOf(fromPath)
  if (parent === targetDirId) return null
  const name = entryName(fromPath)
  return targetDirId ? `${targetDirId}/${name}` : name
}

/** FR-027 guard, mirroring the main-process check for fast, friendly feedback. */
export function wouldMoveIntoOwnDescendant(fromPath: string, targetDirId: string): boolean {
  return targetDirId === fromPath || targetDirId.startsWith(fromPath + '/')
}

/**
 * Client-side name validation for rename/create. Main performs the real
 * containment check; this exists for immediate, actionable feedback.
 */
export function validateEntryName(kind: EntryKind, currentName: string, newName: string): string | null {
  const trimmed = newName.trim()
  if (trimmed.length === 0) return 'Name cannot be empty'
  if (trimmed === currentName) return null
  if (trimmed.includes('/') || trimmed.includes('\\')) return 'Name cannot contain path separators'
  if (trimmed === '.' || trimmed === '..') return 'Invalid name'
  if (kind === 'file') {
    const ext = trimmed.slice(trimmed.lastIndexOf('.')).toLowerCase()
    if (!MARKDOWN_EXTENSIONS.has(ext)) {
      return 'Files in the explorer must have the .md or .markdown extension'
    }
  }
  return null
}

/** True when `path` is at or under `prefix` (used for folder moves and deletes). */
export function isWithinOrEqual(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/')
}

export interface DeletePlan {
  /** Open documents whose backing file is being deleted. */
  open: DocumentState[]
  /** Clean open documents that can be closed after a successful delete. */
  cleanToClose: DocumentState[]
  /** Dirty open documents — the delete must be refused while these exist. */
  dirtyBlockers: DocumentState[]
}

/**
 * FR-025 + Principle III: plan what happens to open documents on delete.
 * `isDirty` must consult the live editor (R4): the reducer flag lags
 * keystrokes by the listener debounce, and a delete inside that window must
 * still be refused rather than silently discarding the edit.
 */
export function planDelete(
  documents: DocumentState[],
  targetPath: string,
  isDirty: (doc: DocumentState) => boolean = d => d.dirty
): DeletePlan {
  const open = documents.filter(d => d.path !== null && isWithinOrEqual(d.path, targetPath))
  return {
    open,
    cleanToClose: open.filter(d => !isDirty(d)),
    dirtyBlockers: open.filter(d => isDirty(d))
  }
}

/** Wording for the delete confirmation (FR-025, FR-029, FR-029a, FR-029b). */
export function deleteDescription(info: EntryInfo): string {
  const parts: string[] = []
  if (info.kind === 'directory' && !info.isEmpty) {
    parts.push('This folder is not empty and its entire contents will be deleted.')
  }
  if (info.kind === 'directory' && info.hasHiddenFiles) {
    parts.push('It also contains files that are not shown in the explorer, which will be deleted too.')
  }
  return parts.join(' ')
}
