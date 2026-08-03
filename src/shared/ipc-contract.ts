export type ErrorCode =
  | 'OUTSIDE_WORKSPACE'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PERMISSION'
  | 'LOCKED'
  | 'TOO_LARGE'
  | 'NOT_TEXT'
  | 'TRASH_UNAVAILABLE'
  | 'NO_WORKSPACE'
  | 'IO'

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: ErrorCode; message: string }

export type EntryKind = 'file' | 'directory'

export interface WorkspaceInfo {
  name: string
  /** The realpath of the opened workspace root (spec 003, display only — the
   *  renderer never feeds it back into any filesystem call). */
  path: string | null
  entries: DirEntry[]
}

export interface DirEntry {
  path: string
  name: string
  kind: EntryKind
}

export interface OpenedFile {
  path: string | null
  name: string
  content: string
  mtimeMs: number
  size: number
}

export interface WriteReceipt {
  mtimeMs: number
  size: number
}

export interface TrashReceipt {
  trashed: boolean
}

export interface EntryInfo {
  kind: EntryKind
  /** Directory only: true when the folder contains no entries at all. */
  isEmpty: boolean
  /** Directory only: true when the subtree contains files the tree hides (FR-029b). */
  hasHiddenFiles: boolean
}

export interface WatchEvent {
  path: string
  kind: 'added' | 'changed' | 'removed'
  isDirectory: boolean
}

export interface DocumentChangeEvent {
  path: string
  kind: 'changed' | 'removed'
}

/** Recent-entry type: a markdown file or a workspace folder (spec 004). */
export type RecentKind = 'file' | 'folder'

/** A persisted recent item (spec 004, FR-001…013). `path` is absolute. */
export interface RecentItem {
  path: string
  kind: RecentKind
  name: string
  lastOpenedAt: number
}

export type MenuCommand =
  | 'open-file' | 'open-folder' | 'save' | 'save-as'
  | 'close-tab' | 'new-file'
  | { type: 'open-recent'; path: string; kind: RecentKind }

export interface Settings {
  sidebarWidth: number
  themeOverride: 'light' | 'dark' | null
}

export interface DesktopApi {
  openFolderDialog(): Promise<Result<WorkspaceInfo | null>>
  readDir(relativePath: string): Promise<Result<DirEntry[]>>
  openFileDialog(): Promise<Result<OpenedFile | null>>
  readFile(relativePath: string): Promise<Result<OpenedFile>>
  openRecentFile(path: string): Promise<Result<OpenedFile>>
  openRecentFolder(path: string): Promise<Result<WorkspaceInfo>>
  writeFile(relativePath: string, content: string): Promise<Result<WriteReceipt>>
  saveFileDialog(suggestedName: string, content: string): Promise<Result<OpenedFile | null>>
  createEntry(parentRelativePath: string, name: string, kind: EntryKind): Promise<Result<DirEntry>>
  moveEntry(fromRelativePath: string, toRelativePath: string): Promise<Result<DirEntry>>
  trashEntry(relativePath: string, permanent?: boolean): Promise<Result<TrashReceipt>>
  describeEntry(relativePath: string): Promise<Result<EntryInfo>>
  getSettings(): Promise<Result<Settings>>
  updateSettings(patch: Partial<Settings>): Promise<Result<Settings>>
  onWorkspaceChanged(cb: (e: WatchEvent) => void): () => void
  onDocumentChanged(cb: (e: DocumentChangeEvent) => void): () => void
  onMenuCommand(cb: (c: MenuCommand) => void): () => void
  onQuitRequested(cb: () => void): () => void
  confirmQuit(decision: 'quit' | 'cancel'): void
}
