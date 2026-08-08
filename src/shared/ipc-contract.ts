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

/** A quiet persistence warning from main (spec 004, FR-011): the recent-items
 *  config could not be written. Non-fatal — the operation it accompanied
 *  already succeeded. */
export interface RecentItemsWarning {
  message: string
}

/** Native confirmation surfaces (spec 008). A closed union of every dialog the
 *  app can show through the OS message box. Requests carry only display strings
 *  and renderer-owned state — NEVER filesystem paths (Principle II). */
export type NativeDialogRequest =
  | { kind: 'unsaved-close'; documentTitle: string; error?: string }
  | { kind: 'unsaved-quit'; documentTitles: string[]; error?: string }
  | { kind: 'folder-open'; documentTitles: string[]; error?: string }
  | { kind: 'external-changed'; documentTitle: string }
  | { kind: 'external-removed'; documentTitle: string; error?: string }
  | { kind: 'delete-to-trash'; targetName: string; detail: string; cleanToCloseTitles: string[] }
  | { kind: 'permanent-delete'; targetName: string; detail: string; cleanToCloseTitles: string[] }
  | { kind: 'delete-blocked'; targetName: string; blockerTitles: string[] }
  | { kind: 'operation-failed'; message: string }

/** The semantic outcome of a native dialog — what the renderer acts on. The
 *  renderer never receives a button index or the platform (spec 008). */
export type NativeDialogDecision =
  | 'save' | 'discard' | 'save-all' | 'discard-all'
  | 'keep' | 'reload' | 'ok' | 'save-as'
  | 'delete' | 'delete-permanent' | 'acknowledge' | 'cancel'

export type MenuCommand =
  | 'open-file' | 'open-folder' | 'save' | 'save-as'
  | 'close-tab' | 'new-file'
  | { type: 'open-recent'; path: string; kind: RecentKind }

/** The five named visual styles for the formatted WYSIWYG canvas (spec 016).
 *  A closed union — validated in main, never arbitrary text. The theme's values
 *  (colors, typefaces) live in renderer CSS, not in the config (FR-005). */
export type EditorThemeName =
  | 'rustic' | 'rustic-serif' | 'monotone' | 'monotone-serif' | 'scholarly'

/** Spec 020: the spellchecker languages the app can select explicitly. A
 *  closed union — validated in main, never arbitrary text. More languages can
 *  be added here later (the mechanism is identical). */
export type SpellcheckLanguage = 'en-GB' | 'en-US'

/** Spec 023: the six curated editor colour tokens a custom theme stores, mapped
 *  to Crepe's `--crepe-color-*` variables (contracts/editor-theme.md). A closed
 *  record of `#rrggbb` hex strings — validated in main (FR-010). */
export interface EditorColors {
  background: string
  foreground: string
  accent: string
  surface: string
  outline: string
  code: string
}

export interface Settings {
  sidebarWidth: number
  themeOverride: 'light' | 'dark' | null
  /** The persisted visibility of the left explorer panel (spec 010 FR-007).
   *  Defaults to true — a fresh install shows the explorer; once the user
   *  toggles it, the choice persists across restarts. */
  explorerVisible: boolean
  /** The editor font-family choice (spec 012 FR-003/FR-004). Defaults to
   *  'sans-serif'. A closed union — validated in main, never arbitrary text.
   *  Spec 023 FR-008: ACTIVE — it drives the typeface for a custom editor theme
   *  and is written to the preset's font when a preset is selected (FR-005). */
  editorFont: 'sans-serif' | 'serif'
  /** The selected editor theme (spec 016 FR-001/FR-002). Defaults to
   *  'rustic'. A closed union — validated in main, never arbitrary text. When
   *  `editorColors` is set, the effective theme is detected from the values
   *  instead (spec 023 FR-003/004/007). */
  editorTheme: EditorThemeName
  /** Spec 023: custom editor colour overrides, or `null` when the preset's
   *  colours are used (FR-001). A closed six-key record of `#rrggbb` hex
   *  strings, validated in main (FR-010). */
  editorColors: EditorColors | null
  /** Spec 020 FR-006/FR-009: whether the native spellchecker is enabled.
   *  Defaults to true. A closed type — validated in main as a boolean, never
   *  arbitrary text. Persisted via the same settings store as the rest. */
  spellcheckEnabled: boolean
  /** Spec 020 (2026-08-07): the explicit spellchecker language, or `null` for
   *  the platform/system default. A closed union — validated in main. Applied
   *  via `session.setSpellCheckerLanguages`. */
  spellcheckLanguage: SpellcheckLanguage | null
}

export interface DesktopApi {
  /** The platform the app runs on (`process.platform`, exposed read-only so the
   *  sandboxed renderer can adapt labels — spec 015 FR-003). */
  platform: NodeJS.Platform
  /**
   * Phase 1 of folder open (spec 004, FR-009/FR-010): with `path` undefined,
   * shows the OS folder picker; with `path`, opens only a recorded recent
   * folder (rejected with `OUTSIDE_WORKSPACE` otherwise). Validates the target
   * and returns its entries WITHOUT touching the current workspace — the swap
   * happens only on `commitFolderOpen`, so a cancelled or failed open leaves
   * the current workspace and session unchanged. Returns `null` when the picker
   * is cancelled.
   */
  prepareFolderOpen(path?: string): Promise<Result<WorkspaceInfo | null>>
  /** Phase 2 of folder open: commit the prepared folder as the active
   *  workspace and record it in Recent Items. */
  commitFolderOpen(): Promise<Result<WorkspaceInfo>>
  /** Abandon a prepared folder open (no workspace change). */
  cancelFolderOpen(): Promise<Result<null>>
  readDir(relativePath: string): Promise<Result<DirEntry[]>>
  openFileDialog(): Promise<Result<OpenedFile | null>>
  readFile(relativePath: string): Promise<Result<OpenedFile>>
  openRecentFile(path: string): Promise<Result<OpenedFile>>
  writeFile(relativePath: string, content: string): Promise<Result<WriteReceipt>>
  saveFileDialog(suggestedName: string, content: string): Promise<Result<OpenedFile | null>>
  createEntry(parentRelativePath: string, name: string, kind: EntryKind): Promise<Result<DirEntry>>
  moveEntry(fromRelativePath: string, toRelativePath: string): Promise<Result<DirEntry>>
  trashEntry(relativePath: string, permanent?: boolean): Promise<Result<TrashReceipt>>
  describeEntry(relativePath: string): Promise<Result<EntryInfo>>
  /** Spec 015: reveal a workspace file or folder in the OS file manager. The
   *  relative path is containment-validated in main before any OS call; files
   *  open their parent folder with the file highlighted, folders open
   *  directly (FR-001/002/005). */
  revealEntry(relativePath: string, kind: EntryKind): Promise<Result<null>>
  getSettings(): Promise<Result<Settings>>
  updateSettings(patch: Partial<Settings>): Promise<Result<Settings>>
  onWorkspaceChanged(cb: (e: WatchEvent) => void): () => void
  onDocumentChanged(cb: (e: DocumentChangeEvent) => void): () => void
  onMenuCommand(cb: (c: MenuCommand) => void): () => void
  onRecentItemsWarning(cb: (w: RecentItemsWarning) => void): () => void
  onRecentItemsOk(cb: () => void): () => void
  onQuitRequested(cb: () => void): () => void
  confirmQuit(decision: 'quit' | 'cancel'): void
  /** Spec 008: show the platform-native confirmation box for the request and
   *  resolve with the semantic decision. Only display strings cross the
   *  boundary; the renderer never sees a button index or the platform. */
  showConfirmation(request: NativeDialogRequest): Promise<Result<NativeDialogDecision>>
  /** Spec 010: the current Recent Items list for the hamburger submenu. Returns
   *  display strings only — the renderer never feeds the paths back into the
   *  filesystem (the recent-open handlers re-validate against this list). */
  getRecentItems(): Promise<Result<RecentItem[]>>
  /** Spec 010: clear the Recent Items list (hamburger "Clear Recent Items"). */
  clearRecentItems(): Promise<Result<null>>
  /** Spec 010: request a quit through the normal window-close flow, so the
   *  renderer's unsaved-changes prompt still guards the exit (Principle III). */
  requestQuit(): Promise<Result<null>>
  /** Spec 010: toggle the devtools window from the hamburger's View menu. */
  toggleDevTools(): Promise<Result<null>>
  /** Spec 020 (JS spellchecker): the user's custom dictionary words. */
  getSpellcheckWords(): Promise<Result<string[]>>
  /** Spec 020 (JS spellchecker): teach the JS checker a word so it is never
   *  flagged again. Returns the updated word list. */
  addSpellcheckWord(word: string): Promise<Result<string[]>>
}
