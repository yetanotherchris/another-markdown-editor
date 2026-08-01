# Contract: Preload API Surface

**Feature**: `001-markdown-editor` | **Date**: 2026-08-01

The complete and **closed** set of capabilities available to the renderer.
Constitution Principle I: this list is fixed. Adding a generic pass-through is
prohibited.

## Exposed object

Exposed as `window.api` via `contextBridge.exposeInMainWorld`. The renderer has
no other route to the main process.

```ts
interface DesktopApi {
  // Workspace
  openFolderDialog(): Promise<Result<WorkspaceInfo | null>>
  readDir(relativePath: string): Promise<Result<DirEntry[]>>

  // Documents
  openFileDialog(): Promise<Result<OpenedFile | null>>
  readFile(relativePath: string): Promise<Result<OpenedFile>>
  writeFile(relativePath: string, content: string): Promise<Result<WriteReceipt>>
  saveFileDialog(suggestedName: string, content: string): Promise<Result<OpenedFile | null>>

  // Mutations
  createEntry(parentRelativePath: string, name: string, kind: EntryKind): Promise<Result<DirEntry>>
  moveEntry(fromRelativePath: string, toRelativePath: string): Promise<Result<DirEntry>>
  trashEntry(relativePath: string, permanent?: boolean): Promise<Result<TrashReceipt>>

  // Settings
  getSettings(): Promise<Result<Settings>>
  updateSettings(patch: Partial<Settings>): Promise<Result<Settings>>

  // Events (main → renderer). Each returns an unsubscribe function.
  onWorkspaceChanged(cb: (e: WatchEvent) => void): () => void
  onDocumentChanged(cb: (e: DocumentChangeEvent) => void): () => void
  onMenuCommand(cb: (c: MenuCommand) => void): () => void
  onQuitRequested(cb: () => void): () => void

  // Renderer → main, for flows main must coordinate
  confirmQuit(decision: 'quit' | 'cancel'): void
}
```

## Types

```ts
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: ErrorCode; message: string }

type ErrorCode =
  | 'OUTSIDE_WORKSPACE'   // Path containment refused it (FR-002/003/004)
  | 'NOT_FOUND'
  | 'CONFLICT'            // Target exists (FR-026), or move into own descendant (FR-027)
  | 'PERMISSION'
  | 'LOCKED'              // Held by another process; common on Windows
  | 'TOO_LARGE'
  | 'NOT_TEXT'            // Not valid UTF-8 (FR-009)
  | 'TRASH_UNAVAILABLE'   // FR-029a
  | 'NO_WORKSPACE'
  | 'IO'

type EntryKind = 'file' | 'directory'

interface WorkspaceInfo { name: string; entries: DirEntry[] }

interface DirEntry {
  path: string          // Workspace-relative, POSIX separators
  name: string
  kind: EntryKind
}

interface OpenedFile {
  path: string | null   // null when outside any workspace (single-file open)
  name: string
  content: string
  mtimeMs: number
  size: number
}

interface WriteReceipt { mtimeMs: number; size: number }

interface TrashReceipt { trashed: boolean }  // false = permanently deleted

interface WatchEvent {
  path: string
  kind: 'added' | 'changed' | 'removed'
  isDirectory: boolean
}

interface DocumentChangeEvent {
  path: string
  kind: 'changed' | 'removed'
}

type MenuCommand =
  | 'open-file' | 'open-folder' | 'save' | 'save-as'
  | 'close-tab' | 'new-file'

interface Settings {
  sidebarWidth: number
  themeOverride: 'light' | 'dark' | null
}
```

## Rules

1. **No generic escape hatch.** No `invoke(channel, ...args)`, no `require`, no
   `fs` handle, no path-to-anything reader. Adding one is a constitution
   violation, not a design choice.
2. **Errors are values, never thrown.** Every method resolves to `Result<T>`.
   Rejected promises crossing `contextBridge` lose their type and can leak stack
   traces containing absolute paths.
3. **Paths in, paths out, are workspace-relative** with POSIX separators. The
   renderer never sees an absolute path. This means a renderer compromise cannot
   even name a file outside the workspace.
4. **`relativePath` is untrusted.** Main validates every one (research.md R6),
   regardless of the fact that the renderer only ever sends paths main gave it.
5. **Dialogs return relative paths when inside the workspace.** `openFileDialog`
   may return `path: null` for a file opened outside any workspace; such a
   document is editable and savable but has no tree presence.
6. **Callbacks are cleaned up.** Every `on*` returns an unsubscribe function;
   the preload holds no unbounded listener list.
7. **`confirmQuit` exists** because only main can veto application quit, while
   only the renderer knows which documents are dirty. Main asks, renderer
   decides, main acts (FR-023).

## Rejected alternatives

| Alternative | Why rejected |
|-------------|--------------|
| Expose `ipcRenderer` directly | Any channel becomes reachable; Principle I breach |
| Absolute paths in the API | A compromised renderer could name arbitrary files; relative paths make the boundary structural |
| Throwing errors | Loses typed codes across the bridge and risks leaking paths in stack traces |
| Sync `readFileSync`-style methods | Blocks the renderer; breaches Principle IV |
