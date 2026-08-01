# Tasks: Desktop Markdown Editor

**Feature**: `001-markdown-editor` | **Date**: 2026-08-01

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Implementation strategy**: Complete Phase 1 and Phase 2 before any user story,
because they establish the security and data-loss boundaries. Then implement
stories in priority order (P1 → P2 → P3). This feature requests tests
(constitution V), so every test task is included and ordered before its
implementation.

---

## Phase 1: Project Setup

**Purpose**: Toolchain, scaffolding, linting, and three-target electron-vite build.

- [X] T001 [P] Scaffold electron-vite TypeScript project with `src/main`, `src/preload`, `src/renderer`, `tests/main`, `tests/renderer` (Vite 5 + React 19 + Electron 43)
- [X] T002 [P] Install runtime dependencies: `react`, `react-dom`, `@milkdown/crepe`, `react-arborist`, `react-resizable-panels`, `chokidar`
- [X] T003 [P] Install dev dependencies: `typescript`, `vitest`, `jsdom`, `@vitejs/plugin-react`, `electron-vite`, `@types/node`, `@types/react`, `@types/react-dom`, `eslint`, `prettier`
- [X] T004 [P] Configure `tsconfig.json` with `strict: true` for each of main, preload, renderer, and shared types
- [X] T005 [P] Configure `vitest.workspace.ts` with a `node` project for `tests/main` and a `jsdom` project for `tests/renderer`
- [X] T006 Configure npm scripts: `npm run dev`, `npm run build`, `npm run test`, `npm run lint`, `npm run typecheck`
- [X] T007 Add ESLint rule forbidding `import ... from 'fs'` or `require('fs')` outside `src/main/`
- [X] T008 Add a smoke script verifying `electron-vite dev` starts without crashing

**Checkpoint**: `npm run dev` boots, `npm run test` runs both Vitest projects, and `npm run typecheck` passes.

---

## Phase 2: Foundational Security and IPC

**Purpose**: The path containment boundary, atomic writes, and the IPC contract
must be in place before any renderer code touches the filesystem.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

### Tests

- [ ] T009 [P] Adversarial path containment tests in `tests/main/paths.test.ts`: `..`, encoded traversal, absolute paths, sibling prefixes, symlinks/junctions outside root, Windows device names, trailing dots/spaces, alternate data streams, non-strings, empty paths
- [ ] T010 [P] Atomic write tests in `tests/main/write.test.ts`: happy path, interrupted by process crash, target locked, disk full, temp file left after failure, no write when content unchanged
- [ ] T011 [P] Mutation tests in `tests/main/mutate.test.ts`: rename, move, conflict, move into own descendant, create folder, create file, create invalid name, move symlink to outside
- [ ] T012 [P] Trash tests in `tests/main/mutate.test.ts`: item goes to OS trash, fallback path when trash unavailable, warning about hidden folder contents
- [ ] T013 [P] Watcher tests in `tests/main/watch.test.ts`: external change reported, own write suppressed, debounce, rename pairs, symlink loops ignored
- [ ] T014 [P] IPC contract tests in `tests/main/ipc.test.ts`: every channel validates shape, returns typed errors, never leaks absolute paths, rejects paths outside root

### Implementation

- [ ] T015 [P] Implement `src/main/fs/paths.ts`: `resolveWithinRoot(root, candidate)` with `fs.realpath` and containment using `path.relative`, exported adversarial suite helpers
- [ ] T016 [P] Implement `src/main/fs/read.ts`: `readDir`, `readFile`, `isMarkdown`, UTF-8 validation
- [ ] T017 [P] Implement `src/main/fs/write.ts`: atomic `writeFile` with temp file in target directory, `fsync`, `fs.rename`, cleanup on failure
- [ ] T018 [P] Implement `src/main/fs/mutate.ts`: `mkdir`, `rename`, `trash` using `shell.trashItem` with permanent fallback
- [ ] T019 [P] Implement `src/main/fs/watch.ts`: chokidar wrapper with self-write suppression set and debounce, dropped to filtered markdown/directory events
- [ ] T020 [P] Implement `src/main/settings.ts`: read/write JSON in `userData`, fallback to defaults
- [ ] T021 [P] Implement `src/main/ipc/handlers.ts`: 11 handler functions, one per channel, each validates shape then calls path/fs layer
- [ ] T022 [P] Implement `src/main/ipc/register.ts`: wire handlers to `ipcMain.handle` with typed channel names
- [ ] T023 [P] Implement `src/main/workspace.ts`: open/close folder, real-root caching, unavailable state
- [ ] T024 [P] Implement `src/main/menu.ts`: native File menu and accelerators, emits `menu:command` to renderer
- [ ] T025 [P] Implement `src/main/index.ts`: `BrowserWindow` with `contextIsolation`, `nodeIntegration: false`, `sandbox: true`, preload path, before-quit flow
- [ ] T026 [P] Implement `src/preload/index.ts`: `contextBridge.exposeInMainWorld('api', ...)` with the exact surface from `contracts/preload-api.md`
- [ ] T027 [P] Implement `src/shared/ipc-contract.ts`: TypeScript request/response types shared by main and renderer
- [ ] T028 [P] Implement `src/shared/errors.ts`: closed `ErrorCode` union

**Checkpoint**: `npm run test` passes all main-project tests; `npm run typecheck` passes across main, preload, and shared.

---

## Phase 3: User Story 1 — Write and Save a Markdown Document (P1) 🎯 MVP

**Goal**: A single-file WYSIWYG markdown editor with save and save-as.

**Independent Test**: Quickstart smoke tests 1–3 (open single file, edit, save, undo/roundtrip).

### Tests

- [ ] T029 [P] Renderer document reducer tests in `tests/renderer/documents.test.ts`: dirty derived from content vs baseline, save success clears dirty, save failure keeps dirty, never-saved document gets a path on first save
- [ ] T030 [P] Renderer dirty-tracking tests: undoing to baseline clears dirty, normalised baseline does not falsely mark a file dirty
- [ ] T031 [P] End-to-end characterisation in `tests/renderer/roundtrip.test.ts`: load a markdown fixture, capture baseline, save if not dirty, assert disk bytes unchanged

### Implementation

- [ ] T032 [P] Implement `src/renderer/state/documents.ts`: document reducer, `createEmpty`, `openFile`, `updateContent`, `saveSuccess`, `markDirtyFromEditor`, `closeDocument`, `evict`, `reactivate`
- [ ] T033 [P] Implement `src/renderer/state/settings.ts`: sidebar width, theme override
- [ ] T034 [P] Implement `src/renderer/editor/CrepeHost.tsx`: mounts one Crepe instance, passes `defaultValue`, subscribes `markdownUpdated`, calls `getMarkdown`, isolates from React DOM
- [ ] T035 [P] Implement `src/renderer/editor/instancePool.ts`: LRU cap of 8, eviction only for clean documents, reactivation restores cursor and scroll
- [ ] T036 [P] Implement `src/renderer/main.tsx` and `src/renderer/App.tsx`: shell without sidebar, single active document, tabs if US3 is not yet present
- [ ] T037 [P] Implement `src/renderer/editor/EditorPanel.tsx`: active editor, wires document state, `visibility: hidden` for inactive
- [ ] T038 [P] Implement `src/renderer/App.tsx` menu command handlers: open-file dialog, save, save-as
- [ ] T039 [P] Implement save-as flow: calls `saveFileDialog`, then `writeFile`, then updates document path
- [ ] T040 [P] Implement `tests/renderer/roundtrip.test.ts` fixture corpus and assertions

**Checkpoint**: A file can be opened, edited, saved, and the saved file is unchanged if opened and closed without edits.

---

## Phase 4: User Story 2 — Browse a Folder (P2)

**Goal**: Resizable sidebar showing a folder tree; opening a file loads it into the editor.

**Independent Test**: Quickstart smoke test 1 plus open a file from the tree.

### Tests

- [ ] T041 [P] Tree state reducer tests in `tests/renderer/workspace.test.ts`: expand, collapse, load children, lazy load, replace workspace

### Implementation

- [ ] T042 [P] Implement `src/renderer/state/workspace.ts`: tree node list, expansion state, loading flags, replace on folder open
- [ ] T043 [P] Implement `src/renderer/explorer/Tree.tsx`: react-arborist with row renderer for files/folders
- [ ] T044 [P] Implement `src/renderer/explorer/TreeActions.tsx`: context menu for rename, delete, move, create (new file/folder)
- [ ] T045 [P] Implement `src/renderer/App.tsx` sidebar layout: `react-resizable-panels`, persisted width
- [ ] T046 [P] Implement `src/renderer/App.tsx` open-folder dialog handler and workspace replacement
- [ ] T047 [P] Implement tree update on `workspace:changed` events from main
- [ ] T048 [P] Implement tree keyboard handling: expand/collapse, select, enter to open

**Checkpoint**: Open a folder; tree shows only markdown files and folders; selecting one opens it; sidebar width persists.

---

## Phase 5: User Story 3 — Multiple Tabs (P2)

**Goal**: Open several files, switch between them, close with unsaved confirmation.

**Independent Test**: Quickstart smoke tests 3 and 5 (multiple tabs, close/quit guards).

### Tests

- [ ] T049 [P] Tab reducer tests in `tests/renderer/documents.test.ts` (extend): open existing activates, close dirty prompts, close clean removes, undo/scroll preservation via mocked editor state
- [ ] T050 [P] Quit guard tests: `beforeunload` / `app:quitRequested` flow; cancel keeps app open

### Implementation

- [ ] T051 [P] Implement `src/renderer/tabs/TabBar.tsx`: tab list, close buttons, dirty indicator, active highlight
- [ ] T052 [P] Implement `src/renderer/App.tsx` tab switching logic
- [ ] T053 [P] Implement close-tab confirmation dialog, wired to save/discard/cancel
- [ ] T054 [P] Implement `app:quitRequested` handling: confirm once, list all dirty documents, save/discard/cancel per document
- [ ] T055 [P] Implement `onDocumentChanged` handling: auto-reload when clean, prompt when dirty
- [ ] T056 [P] Implement `editor/CrepeHost.tsx` per-instance cursor/scroll capture

**Checkpoint**: Open three files, switch, edit each, close with dirty prompts, quit with dirty prompts, cancel preserves everything.

---

## Phase 6: User Story 4 — Reorganise Files and Folders (P3)

**Goal**: Rename, delete, move, create files and folders from the tree.

**Independent Test**: Quickstart smoke test 4.

### Implementation

- [ ] T057 [P] Implement `src/renderer/explorer/operations.ts`: rename, move, create, delete flows with confirmation
- [ ] T058 [P] Implement rename inline editing in `Tree.tsx`
- [ ] T059 [P] Implement drag-and-drop move (optional) or explicit move dialog
- [ ] T060 [P] Implement delete confirmation dialog with warning for non-empty folders and hidden files
- [ ] T061 [P] Implement tree update on `workspace:changed` for application-originated mutations
- [ ] T062 [P] Implement open-document path update on rename/move of its backing file (FR-028)

**Checkpoint**: Create, rename, move, and delete files/folders from the tree; open documents follow renames; delete goes to trash.

---

## Phase 7: Cross-Cutting and Polish

**Purpose**: Theme, performance, manual quickstart validation.

- [ ] T063 [P] Implement theme following: `nativeTheme.shouldUseDarkColors` and manual override, Crepe `frame`/`frame-dark` CSS
- [ ] T064 [P] Implement `src/renderer/settings/SettingsPanel.tsx` (or minimal menu) for theme override
- [ ] T065 [P] Add a lint rule ensuring `src/renderer` and `src/preload` do not import Node modules
- [ ] T066 [P] Add manual quickstart validation (`quickstart.md`) and capture any deviations
- [ ] T067 [P] Run full `npm run test`, `npm run typecheck`, `npm run lint`
- [ ] T068 [P] Review `spec.md`, `plan.md`, `research.md`, `data-model.md`, and contracts for consistency
- [ ] T069 [P] Update this `tasks.md` to mark completed tasks, add any discovered tasks

**Checkpoint**: Quickstart.md smoke tests pass; all automated tests pass; no Node imports in renderer or preload.

---

## Dependencies & Execution Order

| Phase | Depends On | Blocks |
|-------|------------|--------|
| Phase 1: Setup | — | Phase 2 |
| Phase 2: Foundational | Phase 1 | Phases 3–6 |
| Phase 3: US1 (P1) | Phase 2 | MVP demo |
| Phase 4: US2 (P2) | Phase 2 | — (can parallel with US3 if staffed) |
| Phase 5: US3 (P2) | Phase 2 | — (can parallel with US2 if staffed) |
| Phase 6: US4 (P3) | Phase 2; US2 (tree UI) | — |
| Phase 7: Polish | All above | — |

### Parallel Opportunities

- Within Phase 1: T001–T008 are all independent except T006/T008 which depend on project files.
- Within Phase 2: T009–T014 test tasks can be written in parallel with T015–T028 implementation, pairing each test task with its implementation.
- Phase 3 test tasks (T029–T031) can be written before T032–T040.
- Phases 4 and 5 can proceed in parallel once Phase 2 is done, because tabs and tree are independent of each other except the final integration in `App.tsx`.
- Phase 6 depends on the tree from Phase 4 but can start once T042–T043 are stable.

### Sequential Gating

- T015 (path containment) must be written before T016–T020 and T022, because they depend on it.
- T025 (main window) must be completed before any manual quickstart validation.
- T026 (preload) must be completed before T032–T040 can use `window.api`.
- T034 (CrepeHost) must be completed before T035 (instance pool) and T056 (cursor/scroll capture).

---

## Notes

- [P] tasks have no dependencies within their phase; run them in parallel.
- No task should implement the spec for packaging or release automation.
- Every task must leave code in a compilable state (`npm run typecheck`).
- Any deviation from a task's expected implementation must be recorded in
  `specs/001-markdown-editor/research.md` or `spec.md` per AGENTS.md rules.
- The security boundary tests (T009–T014) are non-negotiable and must pass before
  Phase 3 implementation begins.
- The MVP deliverable is the end of Phase 3; all subsequent phases are
  increments.
