# Suggested Changes — another-markdown-editor

Covers the whole `src` tree (renderer, main, shared, preload) and `tests`.

## Renderer — App.tsx (1,218 lines, 42 useCallback handlers, ~166 branch points)

1. **Extract `useDocumentLifecycle` hook** — move `saveDocument`, `doClose`, `handleCloseRequest`, `reloadDocument`, `handleQuitRequest`, `flushLiveContent`, `getLiveContent`, `isDirtyLive`, `getContentToSave`, `enforcePoolCap`, `handleContentChange`, `handleBaselineCapture`, `handleCursorState`, `handleActivate` into their own file.

2. **Extract `useExternalChangeHandling` hook** — move `handleExternalPrompt` and `handleExternalChange`, which react to filesystem events rather than user actions.

3. **Extract `useWorkspaceTree` hook** — move `handleTreeSelect`, `handleTreeActivate`, `handleTreeToggle`, `handleTreeMove`, `applyMove`, `handleRename`, `handleEditingCancelled`, `handleCreate`, `cleanupAfterDelete`, `runDeleteConfirmation`.

4. **Extract `useDialogCoordination` hook** — move `releaseDialogSurface`, `showOperationError`, and the `dialogInFlightRef` guard.

5. **Extract `useSourceViewToggle` hook** — move `handleShowSource`, `handleReturnToFormatted`, `openPathInSource`, `handleViewSource`, `openPathInFormatted`.

6. **Extract `useWorkspaceFolder` hook** — move `commitFolderOpen`, `runFolderOpenFlow`, `revealExplorer`, `dirtyWorkspaceRelativeDocs`.

7. **Extract `useSidebarLayout` hook** — move `handleSidebarResize`, `handleToggleExplorer`, and the `explorerCollapsed` / `explorerRestoreDoneRef` state.

8. **Extract `useMenuCommands` hook** — move `handleMenuCommand`, `handleOpen`, `handleNew`, wiring them to the hooks above instead of duplicating logic inline.

9. **Reduce `App.tsx` to composition only** — after 1–8, it should just call these hooks and render JSX. Target: under ~200 lines.

10. **Split `runFolderOpenFlow` (73 lines), `handleQuitRequest` (58 lines), `runDeleteConfirmation` (58 lines)** into named sub-steps (dirty-check, confirmation, save-or-discard, cleanup), independent of which file they end up in.

## Renderer — other files

11. **`explorer/Tree.tsx` (499 lines, ~47 branch points)** — separate drag/drop, keyboard-nav, and rename-in-place logic into their own hooks or handler modules (e.g. `useTreeDragDrop`, `useTreeRename`), leaving `Tree.tsx` as the render/wiring layer.

12. **`state/documents.ts` (481 lines) and `state/workspace.ts` (337 lines)** — these are reducers, which is the right pattern, but each has grown to cover many action types in one `switch`. Split action handling into per-action-type helper functions (`handleOpenDocument`, `handleCloseDocument`, etc.) called from the reducer's `switch`, so each case body stays short and independently testable.

13. **`chrome/HamburgerMenu.tsx` (261 lines, ~33 branch points)** — separate the menu item *definitions/visibility rules* (data) from the *rendering* (JSX). Move condition logic into `chrome/menuModel.ts` (which already exists) rather than inline in the component.

14. **`editor/CrepeHost.tsx` (212 lines)** — audit for editor-lifecycle logic (mount/unmount/sync) that could move into `editor/instancePool.ts` or a dedicated hook, keeping this component focused on rendering the editor surface.

## Shared

15. **`shared/nativeDialog.ts` (300 lines, ~51 branch points)** — most of this is platform-specific button/label tables (data), which is fine. `messagesFor` (~90 lines) is a long if/else chain producing per-dialog-kind messages; convert it to a lookup map keyed by `NativeDialogRequest.kind` (`Record<Kind, (req) => {message, detail}>`) to remove the branching.

16. **`shared/ipc-contract.ts` (172 lines)** — no code changes needed, but flag any type additions here for review since every change ripples across `preload`, `main/ipc`, and `renderer` — it's the highest-coupling file in the project by design.

## Main process

17. **`main/ipc/handlers.ts` (703 lines, 21 `ipcMain.handle` registrations, ~64 branch points)** — split by domain into separate registration modules: `ipc/fileHandlers.ts`, `ipc/dialogHandlers.ts`, `ipc/workspaceHandlers.ts`, `ipc/settingsHandlers.ts`, each exporting a `register*(ipcMain, ...)` function, aggregated from `ipc/register.ts`. Mirrors the renderer-side hook split so both ends of the IPC boundary stay symmetric and equally sized.

18. **`main/fs/paths.ts` (157 lines, ~29 branch points)** — review for path-validation logic that repeats across functions (workspace-relative checks, traversal guards); consolidate into shared predicates if duplicated.

19. **`main/recentItems.ts` (119 lines) and `main/recentItemsWarning.ts` (29 lines)** — these read as two halves of one concern (recent-items list + its staleness warning). Consider merging or clearly documenting why they're split, since the current split isn't obvious from file names alone.

## Tests

20. **No direct unit test for `main/ipc/handlers.ts`** — `tests/main/ipc.test.ts` only type-checks `shared/ipc-contract.ts`; it doesn't exercise handler bodies (error mapping, validation, business logic). This is the largest, most branch-dense file in `main/` and currently relies entirely on e2e coverage. Add unit tests per handler group once split per (17).

21. **No unit tests for `renderer/explorer/Tree.tsx`** — only indirect coverage via `tests/e2e/organize.spec.ts`. Once drag/drop and rename logic are extracted per (11), unit-test those hooks directly; keep e2e for integration-level checks only.

22. **No unit tests for `renderer/chrome/HamburgerMenu.tsx`, `renderer/editor/CrepeHost.tsx`, `renderer/editor/EditorPanel.tsx`, `renderer/editor/instancePool.ts`** — same pattern: logic is exercised only through e2e specs. Extracting the non-rendering logic per (13)/(14) makes these unit-testable without needing a full Electron/Playwright run.

23. **Mirror the source split in test file layout** — once `App.tsx`'s handlers move into hooks (1–8), add one test file per hook (`useDocumentLifecycle.test.ts`, `useWorkspaceTree.test.ts`, etc.) instead of relying on `tests/renderer/documents.test.ts` and e2e specs to cover orchestration logic indirectly.

## Tooling / regression prevention

24. **Add ESLint `complexity` rule** (e.g. max 10–15 per function) to catch functions creeping back into high-branch-count territory.

25. **Add ESLint `max-lines-per-function`** (e.g. 60–80 lines) and `max-lines` per file (e.g. 300) to catch file/function growth before it reaches `App.tsx`'s or `handlers.ts`'s current size.

26. **Add a CI check or pre-commit hook** running these lint rules, so the constraint is enforced automatically rather than relying on code review to catch it.

27. **Add a coverage threshold in `vitest.config.ts`** (e.g. per-file minimum) to make gaps like (20)–(22) visible in CI rather than only discoverable by manual audit.
