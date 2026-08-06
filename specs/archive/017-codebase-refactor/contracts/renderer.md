# Contracts: Codebase Refactor — renderer

The hook responsibilities, pure-function contracts, and test layout for the
renderer side of `017-codebase-refactor`. The `DesktopApi` surface and every IPC
channel are unchanged (FR-021, SC-011); the preload script is audited but not
refactored.

## Hook contracts (`src/renderer/hooks/`)

Each hook returns an object of stable callbacks. Hooks receive the shared refs
and dispatchers explicitly (no context, no module singletons). App.tsx owns the
two reducers, `sessionRef`, `workspaceRef`, and the view state, and calls the
hooks in dependency order.

### `useDialogQueue(sessionRef)`

```ts
{
  dialogInFlightRef: MutableRefObject<boolean>
  pendingErrorRef: MutableRefObject<string | null>
  pendingExternalPromptRef: MutableRefObject<{ path: string; kind: 'changed' | 'removed' } | null>
  handleExternalChangeRef: MutableRefObject<((doc: DocumentState, kind: 'changed' | 'removed') => boolean) | null>
  showOperationErrorRef: MutableRefObject<((message: string) => Promise<void>) | null>
  releaseDialogSurface: () => void
  showOperationError: (message: string) => Promise<void>
}
```

- `releaseDialogSurface` clears the guard and drains the deferred external
  prompt first (via `handleExternalChangeRef`), then the queued error (via
  `showOperationErrorRef`) — the exact synchronous order of the current
  App.tsx. Each drained item re-acquires the guard and its own release drains
  the next.
- `showOperationError` shows the `operation-failed` native box, or queues the
  message when another prompt is up.
- The session/external hooks write `handleExternalChangeRef.current` and
  `showOperationErrorRef.current` on every render (ref = latest, no stale
  closure).

### `useDocumentSession({ dispatch, sessionRef, dialog })`

```ts
{
  saveDocument: (doc: DocumentState, forceDialog?: boolean) => Promise<'saved' | 'cancelled' | 'failed'>
  doClose: (id: string) => void
  handleCloseRequest: (id: string) => Promise<void>
  reloadDocument: (doc: DocumentState, force?: boolean) => Promise<void>
  handleQuitRequest: () => Promise<void>
  flushLiveContent: () => void
  handleContentChange: (id: string, content: string) => void
  handleBaselineCapture: (id: string, baseline: string) => void
  handleCursorState: (id: string, cursorOffset: number, scrollTop: number) => void
  handleActivate: (id: string) => void
  handleNew: () => void
  handleOpen: (path: string) => void
  getLiveContent: (doc: DocumentState) => string | null
  isDirtyLive: (doc: DocumentState) => boolean
}
```

- Behaviour is the current App.tsx handler bodies, relocating only. Save
  semantics (path vs Save-As, reroute re-write, `SAVE_FAILED` keeps dirty) are
  preserved exactly (FR-007, US3).
- `isDirtyLive`/`getLiveContent` bind the pure `domain/dirty.ts` functions to
  `(id) => instancePool.getMarkdown(id)`.

### `useSourceViewToggle({ dispatch, sessionRef, session, dialog })`

```ts
{
  handleShowSource: (id: string) => void
  handleReturnToFormatted: (id: string) => void
  openPathInSource: (path: string) => Promise<string | null>
  handleViewSource: (path: string) => void
}
```

- Preserves spec 002 transitions verbatim: flush-then-`SET_VIEW` on show-source;
  `editorMatchesContent` no-op round-trip vs `REFRESH_FROM_SOURCE` on return;
  open-tab fast path vs read-into-new-tab for explorer requests.

### `useWorkspaceTree({ dispatch, dispatchWorkspace, sessionRef, workspaceRef, dialog, session, treeApiRef, pendingCreateRef, createCounterRef })`

```ts
{
  handleTreeSelect: (id: string | null) => Promise<void>
  handleTreeActivate: (id: string) => Promise<void>
  handleTreeToggle: (id: string, isLoaded: boolean) => Promise<void>
  applyMove: (fromPath: string, toPath: string) => Promise<boolean>
  handleRename: (node: TreeNode, newName: string) => Promise<boolean>
  handleEditingCancelled: (id: string) => void
  handleCreate: (parent: TreeNode | null, kind: EntryKind) => Promise<void>
  cleanupAfterDelete: (node: TreeNode, plan: DeletePlan) => void
  runDeleteConfirmation: (node: TreeNode) => Promise<void>
  handleTreeMove: (id: string, targetParentId: string) => void
}
```

- Preserves: create-placeholder retry on `CONFLICT`, pending-create cleanup
  rules (empty placeholders only), delete flow (describe → plan → trash →
  TRASH_UNAVAILABLE permanent-delete), reroute on move (`REROUTE_PATHS`),
  clean-to-close re-check before closing (a keystroke during trash keeps the
  doc open, Principle III).

### `useExternalFileEvents({ sessionRef, dialog, session })`

```ts
{
  handleExternalChange: (doc: DocumentState, kind: 'changed' | 'removed') => boolean
  handleExternalPrompt: (prompt: { id: string; kind: 'changed' | 'removed' }) => Promise<void>
}
```

- Registers `handleExternalChangeRef.current = handleExternalChange` so the
  dialog queue can drain deferred notices.
- Returns true when a prompt opens (used by `releaseDialogSurface` to decide
  whether the queued error shows after a deferred notice auto-reloads).

### `useMenuCommands({ sessionRef, dialog, session, tree, source, folder })`

```ts
{
  handleMenuCommand: (command: MenuCommand) => void
}
```

- The single command bus: `open-file`, `open-folder`, `save`, `save-as`,
  `close-tab`, `new-file`, and the object form `{ type: 'open-recent', path,
  kind }` route to the same dispatch paths as today (spec 010 FR-001/FR-002,
  spec 004 FR-007). No branch changes.

### `useWorkspaceFolder({ dispatch, dispatchWorkspace, sessionRef, dialog, session, sidebarPanelRef })`

```ts
{
  commitFolderOpen: () => Promise<void>
  runFolderOpenFlow: (requestPath?: string) => Promise<void>
  dirtyWorkspaceRelativeDocs: () => DocumentState[]
  revealExplorer: () => void
}
```

- Preserves the two-phase open: prepare → dirty-check → confirm (Cancel /
  Discard / Save All with re-prompt) → commit. `pendingFolderOpenRef` moved
  into this hook. Discard-all closes the dirty workspace-relative docs before
  commit; save-all failure re-prompts (FR-010).

### `useSidebarLayout({ sidebarPanelRef, explorerRestoreDoneRef })`

```ts
{
  handleSidebarResize: (size: { asPercentage: number; inPixels: number }) => void
  handleToggleExplorer: () => void
}
```

- Preserves spec 010 US2: never persist a collapsed (0) width; persist
  `explorerVisible` and `sidebarWidth` through the same
  `updateSettings` + `window.api.updateSettings` pair; the mount guard keeps
  the transient size-0 from persisting a fake collapse.

### `useEditorPool({ sessionRef, dialog, session })`

```ts
{ enforcePoolCap: (activeId: string | null) => void }
```

- `!instancePool.hasSpace()` → `evictLRU(documents.filter(isDirtyLive),
  activeId)`; evicts clean candidates only, never the active document. Folds
  into `useDocumentSession` when it needs `isDirtyLive`; kept as a named
  function so FR-002's "editor-instance pool management" module exists.

## Pure-function contracts (`src/renderer/domain/`)

Electron-free, React-free, Vitest-testable. All take the markdown accessor as a
parameter.

```ts
// domain/dirty.ts
getLiveContent(doc, getMarkdown): string | null
isDirtyLive(doc, getMarkdown): boolean
getContentToSave(doc, getMarkdown): string
shouldFlushLive(doc, getMarkdown): boolean

// domain/quit.ts
dirtyDocumentsToSave(docs, isDirty): DocumentState[]
shouldRePromptForFailedSave(saved: 'saved' | 'cancelled' | 'failed'): boolean
```

Each must keep the exact semantics of the current App.tsx bodies (raw-bytes
policy, debounce-aware live-dirty, source-view raw-text handling) — US3
scenario 5, FR-011.

## Explorer tree units

- `explorer/treeMove.ts`: `treeMoveTarget(id, targetParentId)` and
  `treeWouldMoveIntoOwnDescendant(id, targetParentId)` — pure re-exports of the
  current drag/drop target logic in `Tree.tsx`.
- `explorer/treeRename.ts`: the rename start/cancel decision (single edit in
  flight, placeholder-vs-real rename labels, Escape/Enter exits) extracted so it
  is unit-testable without arborist.
- `Tree.tsx` keeps rendering + arborist wiring + context-menu composition only
  (US1 scenario 1, suggestion 7).

## Test layout (`tests/renderer/`)

| File | Content |
|------|---------|
| `helpers.ts` | `createSession()`, `openTwoFiles()`, fixture factories (US4 scenario 3) |
| `documents.open-save-close.test.ts` | `OPEN_NEW`, `OPEN_EXISTING`, `SAVE_SUCCESS`, `SAVE_FAILED`, `CLOSE`, `ACTIVATE` (from documents.test.ts lines 15–325) |
| `documents.dirty.test.ts` | `UPDATE_CONTENT`, `CAPTURE_BASELINE`, `hasDirtyDocuments`, dirty/undo/trailing-newline (lines 89–366) |
| `documents.view.test.ts` | `view mode (spec 002)`, `editorMatchesContent` (lines 511–670) |
| `documents.reroute.test.ts` | `REROUTE_PATHS`, `tab lifecycle` eviction/reactivation (lines 368–508, 672–745) |
| `domain/dirty.test.ts` | the four pure functions, branch coverage |
| `domain/quit.test.ts` | the quit/save-loop pure cores |
| `treeMove.test.ts`, `treeRename.test.ts` | extracted tree units |

Every covered rule remains covered (spec Assumption: re-home/split, never
delete). Application-level e2e tests stop duplicating these unit assertions
(FR-010).
