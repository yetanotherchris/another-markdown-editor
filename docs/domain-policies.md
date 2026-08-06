# Domain Policies

An index of the application's **non-negotiable domain policies** and where each
is enforced in the code, so extractions stay faithful and agents never target
moved code (spec 017, US6/FR-013). Each policy names the invariant, its source
of authority, and its current enforcement location(s).

When extracting or refactoring code, preserve these invariants **by name** —
do not rename the concept or change where it is enforced without updating this
index in the same change (FR-014).

## 1. Process isolation (Principle I)

**Policy**: The renderer has no Node, `fs`, or Electron access. All disk access
is main-process, exposed only through the fixed named `DesktopApi` bridge.

**Enforced at**:
- `src/main/index.ts` — `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`.
- `src/preload/index.ts` — the fixed `contextBridge` surface (no generic
  `invoke` escape hatch).
- `src/shared/ipc-contract.ts` — the typed `DesktopApi` contract.
- `eslint.config.mjs` — `no-restricted-imports` blocks Node/Electron modules
  outside `src/main` and `src/preload`.

## 2. Every path is untrusted; validated in main (Principle II)

**Policy**: Once a folder is opened it is the root. Every filesystem operation
resolves its target against the real path of that root; renderer-side checks are
convenience only. Path containment tests are non-negotiable and accompany the
code.

**Enforced at**:
- `src/main/fs/paths.ts` — `resolveWithinRoot` (realpath-based, defeats `..`,
  symlinks/junctions, drive-relative, reserved names, NUL, ADS).
- `src/main/fs/{read,write,mutate}.ts` — every disk op resolves through
  `resolveWithinRoot` first.
- `tests/main/paths.test.ts` — the adversarial containment suite.

## 3. No absolute paths in renderer-visible errors (Principle II)

**Policy**: Error messages shown in the renderer never contain absolute paths
outside the workspace root.

**Enforced at**:
- `src/main/scrubPaths.ts` — `scrubAbsolutePaths`, the single scrub point.
- `src/main/ipc/handlers/context.ts` — `sanitizeError` runs the scrub on every
  renderer-visible error.
- `tests/main/...` and e2e path-leak tests.

## 4. Saves are atomic (Principle III)

**Policy**: A save writes a temp file in the destination directory then renames
over the target. A failed or interrupted write never leaves a truncated file.

**Enforced at**:
- `src/main/fs/atomicWrite.ts` — `atomicWrite` (temp + fsync + rename).
- `src/main/fs/write.ts` — document writes route through the same temp+rename
  flow.
- `src/main/settingsFile.ts` and `src/main/recentItems.ts` — config writes use
  `atomicWrite(…, 0o600)`.
- `tests/main/write.test.ts` — the interrupted-write case.

## 5. A failed save leaves the document dirty (Principle III)

**Policy**: A save failure keeps the tab's unsaved marker and surfaces the
failure; the dirty flag is never silently cleared.

**Enforced at**:
- `src/renderer/hooks/useDocumentSession.ts` — `saveDocument` dispatches
  `SAVE_FAILED` and re-prompts with the failure explained.
- `src/renderer/state/documents.ts` — `handleSaveFailed` returns state
  unchanged (dirty stays set).
- e2e failing-save re-prompt tests.

## 6. Raw-bytes handling (spec 002)

**Policy**: `baseline`/`content` hold the raw on-disk bytes; the editor's
normalized serialization lives only in `editorBaseline`. Crepe's normalization
never rewrites the raw content of a pristine document, and a no-edit open/save
round-trips byte-identical.

**Enforced at**:
- `src/renderer/state/documents.ts` — `handleCaptureBaseline`, `handleSaveSuccess`,
  `handleUpdateContent` (dirty computed against `editorBaseline`, not `baseline`,
  for formatted docs).
- `src/renderer/domain/dirty.ts` — `getContentToSave`, `shouldFlushLive`,
  `isDirtyLive` (the live-dirty reference is the editor's own baseline).
- `tests/renderer/roundtrip.test.ts` — byte-policy round trips.

## 7. Live-dirty detection accounts for the debounce (spec 002)

**Policy**: The listener plugin's `markdownUpdated` is debounced (~200 ms), so
close/quit guards read the live editor content, not just the reducer flag, or
the last keystrokes could be discarded without a prompt.

**Enforced at**:
- `src/renderer/domain/dirty.ts` — `isDirtyLive` (live editor vs
  `editorBaseline`).
- `src/renderer/hooks/useDocumentSession.ts` — `flushLiveContent` adopts live
  text only for documents the reducer already knows are dirty.
- `src/renderer/hooks/useEditorPool.ts` — eviction uses `isDirtyLive` so a clean
  document is never misclassified.

## 8. Editor pool evicts clean documents only (spec 001, T035)

**Policy**: The instance pool (cap 8) evicts LRU **clean** instances only, never
the active document. A dirty editor is never unmounted.

**Enforced at**:
- `src/renderer/editor/instancePool.ts` — `evictLRU(dirtyDocuments, activeId)`.
- `src/renderer/hooks/useEditorPool.ts` — `enforcePoolCap` passes
  `isDirtyLive`-filtered documents and the active id.

## 9. Single dialog at a time (spec 008)

**Policy**: Only one native confirmation may be in flight; a second trigger is
ignored or deferred (never dropped) and re-surfaced when the guard releases.

**Enforced at**:
- `src/renderer/hooks/useDialogQueue.ts` — `dialogInFlightRef`, the pending
  error/external queues, `releaseDialogSurface` (drains external-first, then
  error; each drained item re-acquires the guard).
- `src/main/dialogs.ts` — defense-in-depth: main rejects a second box while one
  is up.
- `tests/renderer/quit.test.tsx`, `tests/e2e/launch.ts` (`stubMessageBox`,
  `messageBoxCallCount`).

## 10. Two-phase folder open (spec 004, FR-009/FR-010)

**Policy**: A folder open splits into *prepare* (validate + read, never touch
the live workspace) and *commit* (swap only after the renderer confirms). A
cancelled or failed open leaves the current workspace and session unchanged.

**Enforced at**:
- `src/renderer/hooks/useWorkspaceFolder.ts` — `runFolderOpenFlow`
  (prepare → dirty-check → confirm → commit) with `pendingFolderOpenRef`.
- `src/main/ipc/handlers/workspace.ts` — `workspace:prepareFolderOpen` /
  `workspace:commitFolderOpen` / `workspace:cancelFolderOpen` with the
  single-in-flight `pendingFolderOpen` guard.

## 11. Clean-only close after delete; dirty re-check (spec 003, Principle III)

**Policy**: After a confirmed delete, only documents that were clean at confirm
time are closed — and they are re-checked before closing, because a keystroke
during the async trash would otherwise be discarded without a prompt.

**Enforced at**:
- `src/renderer/hooks/useWorkspaceTree.ts` — `cleanupAfterDelete` re-runs
  `isDirtyLive` before `doClose`.

## 12. Unsaved changes are never discarded without explicit confirmation (Principle III)

**Policy**: Closing a dirty tab, closing the window, or quitting with dirty tabs
prompts, naming the affected files. Delete and overwrite operations are
confirmed.

**Enforced at**:
- `src/renderer/hooks/useDocumentSession.ts` — `handleCloseRequest`,
  `handleQuitRequest` (native unsaved-close/unsaved-quit boxes).
- `src/renderer/hooks/useWorkspaceTree.ts` — `runDeleteConfirmation`
  (delete-to-trash / permanent-delete / delete-blocked boxes).
- `src/renderer/state/documents.ts` — `planClose`, `planQuit`.
