# Data Model: Codebase Refactor

This refactor introduces no new persisted data, IPC channels, or runtime
entities. Its "data model" is the **module/responsibility map** and the
**contracts of the extracted units**. Persisted types (`Settings`, `RecentItem`,
config file shape) and the `DesktopApi` surface are unchanged (FR-021, SC-011).

## 1. Module / responsibility map

### 1.1 Renderer orchestration — after the App.tsx split

App.tsx becomes a composition root owning the two reducers and their refs, then
calling the hooks in dependency order:

| App.tsx-owned state | Type |
|---------------------|------|
| `session` / `dispatch` | `useReducer(documentsReducer, initialSession)` |
| `workspace` / `dispatchWorkspace` | `useReducer(workspaceReducer, initialWorkspaceState)` |
| `sessionRef` | `useRef(session)`; `sessionRef.current = session` per render |
| `workspaceRef` | `useRef(workspace)`; `workspaceRef.current = workspace` per render |
| `sidebarPanelRef` | `usePanelRef()` |
| `explorerRestoreDoneRef`, `pendingCreateRef`, `createCounterRef`, `treeApiRef` | refs passed to the sidebar/tree hooks |
| `pendingEditId`, `footerNote`, `settingsOpen`, `editorFont`, `explorerCollapsed` | `useState` (view state) |

Hook dependency order (the order `useDialogQueue` → `useDocumentSession` →
`useExternalFileEvents` → … they are called in App.tsx):

1. `useDialogQueue(sessionRef)` → `{ dialogInFlightRef, pendingErrorRef,
   pendingExternalPromptRef, handleExternalChangeRef, showOperationErrorRef,
   releaseDialogSurface, showOperationError }`
2. `useDocumentSession({ dispatch, sessionRef, dialog })` → `{ saveDocument,
   doClose, handleCloseRequest, reloadDocument, handleQuitRequest,
   flushLiveContent, enforcePoolCap, handleContentChange, handleBaselineCapture,
   handleCursorState, handleActivate, handleNew, handleOpen, getLiveContent,
   isDirtyLive }`
3. `useSourceViewToggle({ dispatch, sessionRef, dialog, session })` →
   `{ handleShowSource, handleReturnToFormatted, openPathInSource,
   handleViewSource }`
4. `useWorkspaceTree({ dispatch, dispatchWorkspace, sessionRef, workspaceRef,
   dialog, session, treeApiRef, pendingCreateRef, createCounterRef })` →
   `{ handleTreeSelect, handleTreeActivate, handleTreeToggle, applyMove,
   handleRename, handleEditingCancelled, handleCreate, cleanupAfterDelete,
   runDeleteConfirmation, handleTreeMove }`
5. `useExternalFileEvents({ sessionRef, dialog, session })` →
   `{ handleExternalChange, handleExternalPrompt }`; registers
   `handleExternalChange` into `dialog.handleExternalChangeRef`
6. `useMenuCommands({ sessionRef, dialog, session, tree, source, folder })` →
   `{ handleMenuCommand }`
7. `useWorkspaceFolder({ dispatch, dispatchWorkspace, sessionRef, dialog,
   session, sidebarPanelRef })` → `{ commitFolderOpen, runFolderOpenFlow,
   dirtyWorkspaceRelativeDocs, revealExplorer }`
8. `useSidebarLayout({ sidebarPanelRef, explorerRestoreDoneRef })` →
   `{ handleSidebarResize, handleToggleExplorer }`
9. `useEditorPool({ sessionRef, dialog, session })` → `{ enforcePoolCap }` —
   folded into `useDocumentSession` when the pool cap needs `isDirtyLive`
   (see §1.3)

### 1.2 Pure domain functions

| Function | Signature | Behaviour (copied verbatim from App.tsx) |
|----------|-----------|------------------------------------------|
| `getLiveContent` | `(doc: DocumentState, getMarkdown: (id: string) => string \| null) => string \| null` | `null` unless `doc.editorState === 'live'`; else `getMarkdown(doc.id)` |
| `isDirtyLive` | `(doc, getMarkdown) => boolean` | `doc.dirty` → true; `doc.view === 'source'` → false; else `!markdownSame(live, doc.editorBaseline)` |
| `getContentToSave` | `(doc, getMarkdown) => string` | source → `doc.content`; dirty-live → `getMarkdown(doc.id) ?? doc.content`; else `doc.content` |
| `shouldFlushLive` | `(doc, getMarkdown) => boolean` | false for source view; false when `live === null \|\| markdownSame(live, doc.content)`; false when `!doc.dirty`; true otherwise (only adopt live text when the reducer already knows the doc was edited) |
| `isWorkspaceRelative` | `(path: string) => boolean` | not `/`- or `\`-prefixed, and not `[a-zA-Z]:[/\\]` (moved to `explorer/operations.ts`) |

### 1.3 Editor pool

`instancePool` (unchanged singleton): `register`, `remove`, `getMarkdown`,
`evictLRU(dirtyDocuments, activeId)`, `hasSpace`, `liveCount`, `destroyAll`.
`MAX_INSTANCES = 8`; eviction is LRU of **clean** instances only, never the
active document. `enforcePoolCap` (now in `useEditorPool`/`useDocumentSession`):
if `!instancePool.hasSpace()`, call `evictLRU(filter(isDirtyLive))`; on a
candidate, `instancePool.remove(id)` + `dispatch({ type: 'EVICT', payload: { id } })`.
State transitions: `live → evicted` (`EVICT`), `evicted → live` (`REACTIVATE`).

### 1.4 Reducer action-handler extraction

`documentsReducer` switch dispatches to per-action exported helpers:

| Helper | Action types |
|--------|--------------|
| `handleOpenNew(state)` | `OPEN_NEW` |
| `handleOpenExisting(state, payload)` | `OPEN_EXISTING` |
| `handleActivateDoc(state, id)` | `ACTIVATE` |
| `handleUpdateContent(state, payload)` | `UPDATE_CONTENT` |
| `handleCaptureBaseline(state, payload)` | `CAPTURE_BASELINE` |
| `handleSaveSuccess(state, payload)` | `SAVE_SUCCESS` |
| `handleSaveFailed(state)` | `SAVE_FAILED` |
| `handleCloseDoc(state, id)` | `CLOSE` |
| `handleEvict(state, id)` | `EVICT` |
| `handleReactivate(state, payload)` | `REACTIVATE` |
| `handleCaptureEditorState(state, payload)` | `CAPTURE_EDITOR_STATE` |
| `handleReload(state, payload)` | `RELOAD` |
| `handleUpdatePath(state, payload)` | `UPDATE_PATH` |
| `handleReroutePaths(state, payload)` | `REROUTE_PATHS` |
| `handleExternalChange(state, payload)` | `EXTERNAL_CHANGE` |
| `handleSetView(state, payload)` | `SET_VIEW` |
| `handleRefreshFromSource(state, payload)` | `REFRESH_FROM_SOURCE` |

`workspaceReducer` similarly: `handleReplace`, `handleExpandStart`,
`handleExpandSuccess`, `handleExpandError`, `handleSelect`, `handleApplyWatchEvent`,
`handleInsertEntry`, `handleRemoveEntry`, `handleMoveEntry`.

### 1.5 Main-process handler modules

`context.ts` exports the module state and shared helpers consumed by all handler
modules:

| Export | Kind |
|--------|------|
| `workspaceState: WorkspaceState \| null` | module state |
| `workspaceRoot: string \| null` | module state |
| `allowClose: boolean` | module state |
| `ok<T>(value)` / `err(code, message)` | result helpers |
| `sanitizeError(e, root)` / `toAppError(e)` | error mapping |
| `ensureString`, `validateKind`, `validateShape`, `withWorkspace`, `resolveAbsolutePath` | validation/orchestration helpers |
| `isRecentEntry`, `recordRecent`, `removeRecent`, `canonicalPath`, `openFileFromPath` | spec-004 recent/fs helpers |

Channel → module map (unchanged channels, moved registrations):

| Module | Channels |
|--------|----------|
| `files.ts` | `file:openDialog`, `file:read`, `file:write`, `file:saveDialog` |
| `dialogs.ts` | `dialog:show` |
| `workspace.ts` | `workspace:prepareFolderOpen`, `workspace:commitFolderOpen`, `workspace:cancelFolderOpen`, `workspace:readDir` |
| `settings.ts` | `settings:get`, `settings:update` |
| `recent.ts` | `recent:openFile`, `recent:list`, `recent:clear` |
| `app.ts` | `app:requestQuit`, `devtools:toggle`, `quit:respond`, window-close guard |

`register.ts` calls each `register*(window, ctx)` once (idempotent guard kept).

## 2. Guardrail rules (data for the check)

| Rule | Limit | Source |
|------|-------|--------|
| Source module max lines (`src/**/*.{ts,tsx}`) | 500 | SC-001 |
| Orchestration module max lines (hooks, App.tsx) | 300 | SC-001 ("no orchestration module exceeds 300 lines") |
| Stylesheet max lines | 400 | SC-008 |
| Function cyclomatic complexity | ≤ 15, flag > 15 | grok suggestion 4 (tighter bound) |
| Circular imports in `src/**` | 0 cycles | FR-018, SC-009 |
| Unused imports/types/exports in `src/**` | 0 | FR-017, SC-010 |

Exception process (US5 scenario 4): a cohesive module may exceed a size limit
only with a recorded justification in the plan's decision log or the spec's
Assumptions; the guardrail reports the violation and the justification must be
referenced there.

## 3. Invariants preserved (enforcement locations after the refactor)

| Invariant | Enforced at |
|-----------|-------------|
| Raw-bytes handling (baseline vs editorBaseline) | `state/documents.ts` (CAPTURE_BASELINE/SAVE_SUCCESS/UPDATE_CONTENT), `domain/dirty.ts` |
| Live-dirty detection (debounce window) | `domain/dirty.ts` (`isDirtyLive`), `useDocumentSession.flushLiveContent` |
| Clean-only eviction | `instancePool.evictLRU` + `useEditorPool.enforcePoolCap` |
| Single dialog at a time | `useDialogQueue` (`dialogInFlightRef` + drain refs), `src/main/dialogs.ts` (defense-in-depth) |
| Two-phase folder open | `useWorkspaceFolder.runFolderOpenFlow`, `handlers/workspace.ts` prepare/commit |
| Path scrubbing in renderer-visible errors | `scrubAbsolutePaths` called from `handlers/context.ts.sanitizeError` |
| Atomic saves; failed save stays dirty | `fs/write.ts`, `fs/atomicWrite.ts`, `saveDocument` → `SAVE_FAILED` in `useDocumentSession` |
| Process isolation | unchanged `src/main/index.ts` BrowserWindow prefs, `src/preload/index.ts` |
