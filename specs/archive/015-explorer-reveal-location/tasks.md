# Tasks: Explorer Reveal Location

**Feature**: `015-explorer-reveal-location` | **Date**: 2026-08-08

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/reveal.md](./contracts/reveal.md), [quickstart.md](./quickstart.md)

**Implementation strategy**: Add the fixed `entry:reveal` IPC operation in main
first (validated like every other entry operation), expose it through preload,
then add the context-menu action with an OS-adapted label and quiet footer-note
errors, then e2e-verify.

---

## Phase 1: Foundational (IPC Operation)

- [X] T001 Add `revealEntry(path: string, kind: EntryKind): Promise<Result<null>>`
      to `DesktopApi` in `src/shared/ipc-contract.ts`, and a `platform: NodeJS.Platform`
      field (from `process.platform`) (contract `entry:reveal`; FR-005).
- [X] T002 Wire both in `src/preload/index.ts`:
      `revealEntry: (path, kind) => ipcRenderer.invoke('entry:reveal', { path, kind })`
      and `platform: process.platform`.
- [X] T003 Add the `entry:reveal` handler in `src/main/ipc/handlers/files.ts`
      (alongside the other `entry:*` handlers): validate shape/kind, resolve with
      `resolveFile`/`resolveDirectory` under `withWorkspace`, then
      `shell.showItemInFolder` for files and `await shell.openPath` for folders
      (map a non-empty `openPath` result to `err('IO', …)`); wrap in the standard
      try/catch → `toAppError` + `sanitizeError` (FR-001/002/004/006, Principle II).

**Checkpoint**: `entry:reveal` is callable from the preload and validated in main.

---

## Phase 2: User Stories 1 + 2 + 3 - Context Menu Action

- [X] T004 [US1] Add an `onReveal: (node: TreeNode) => void` prop to the `Tree` in
      `src/renderer/explorer/Tree.tsx` and a context-menu item labelled
      `Reveal in Explorer` (Windows) / `Reveal in Finder` (macOS) /
      `Reveal in file manager` (other) via the `platform` from the preload, shown
      for both files and folders (FR-003/007).
- [X] T005 [US1] Wire `onReveal` in `src/renderer/App.tsx`: call
      `window.api.revealEntry(node.id, node.kind)`; on error set the footer note
      to the sanitized message, leaving the session untouched (FR-006).

**Checkpoint**: right-clicking a file or folder offers the platform-adapted
reveal action; failures surface as a quiet footer note.

---

## Phase 3: User Story 4 - Verification

- [X] T006 [US4] Add `tests/e2e/reveal.spec.ts` stubbing
      `shell.showItemInFolder` / `shell.openPath` in main
      (`electronApp.evaluate`): a file reveal calls `showItemInFolder` with the
      file's absolute path (nested folder included), a folder reveal calls
      `openPath` with the folder's absolute path, a deleted target shows the
      footer note and the session is unchanged, and the label matches the
      platform (US1-4 acceptance scenarios).
- [X] T007 [US4] Run `npx playwright test tests/e2e/reveal.spec.ts` and confirm green.

## Phase 4: Polish

- [X] T008 Run the gates: `npm run lint`, `npm run typecheck`, `npm run test`,
      `npm run test:e2e`.
- [X] T009 Archive the feature (`git mv specs/015-explorer-reveal-location
      specs/archive/015-explorer-reveal-location`), set the spec's **Status** to
      `Archived`, mark all tasks `[X]`, and update the
      `015-explorer-reveal-location` row in `AGENTS.md` to `Archived` / `Complete`.

---

## Dependencies & Execution Order

- T001 → T002 → T003 (contract → preload → main handler).
- T004 depends on T002/T003; T005 depends on T004.
- T006/T007 after T003-T005; T008 after all; T009 last.

## Implementation Strategy

1. Contract + preload + main handler.
2. Context-menu action + App wiring.
3. e2e assertions; gates; archive.
