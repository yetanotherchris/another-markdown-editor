# Tasks: Open in Current Tab

**Feature**: `024-open-in-current-tab` | **Date**: 2026-08-08

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/open-mode.md](./contracts/open-mode.md), [quickstart.md](./quickstart.md)

**Implementation strategy**: the reducer `mode` first (unit-tested), then the
pool-aware `openFileFromTree` gate and the dispatch rewiring, then the middle-
click gesture, then e2e.

---

## Phase 1: Foundational (Reducer + Gate)

- [X] T001 Change the `OPEN_EXISTING` payload to `{ value: OpenedFile, mode?: 'replace' }`
      in `src/renderer/state/documents.ts` and extend `handleOpenExisting`: after
      existing-tab activation (unchanged), `mode: 'replace'` swaps the active
      tab's slot for a fresh `openFile(value)` (new id, clear dirty) — else a new
      tab (FR-001/002/003/004/006/007/009).
- [X] T002 Add `openFileFromTree(file: OpenedFile, explicitNew?: boolean)` to
      `src/renderer/hooks/useDocumentSession.ts`: compute the mode via the
      live-dirty gate (`!isDirtyLive(active)`, target not already open,
      `!explicitNew`) and dispatch `OPEN_EXISTING` (R1; FR-001/002/005).
- [X] T003 Rewire the browsing entry points to `session.openFileFromTree`:
      `useWorkspaceTree.ts` (`handleTreeSelect`, `handleTreeActivate`),
      `useMenuCommands.ts` (File > Open, recent-open), and
      `useSourceViewToggle.ts` `handleOpen` (context "Open"). "View source"
      keeps its current dispatch (FR-008).

**Checkpoint**: every browsing open honours the replace-vs-new decision; the
reducer is unit-testable.

---

## Phase 2: User Story 3 - Middle-Click New Tab

- [X] T004 [US3] Add an `onOpenNewTab: (node: TreeNode) => void` prop to `Tree` in
      `src/renderer/explorer/Tree.tsx` and a middle-click handler on the row
      (`onAuxClick`, `e.button === 1`, file nodes only); wire it in
      `src/renderer/App.tsx` to read the file and dispatch with `mode: 'new'`
      (FR-005).

**Checkpoint**: middle-click always opens a new tab.

---

## Phase 3: Verification

- [X] T005 [US1] Add `tests/renderer/documents.open-replace.test.ts` covering the
      reducer decision matrix: clean active → replace (slot swapped, fresh doc,
      dirty clear), dirty active → new tab, untitled clean → replace, existing
      tab → activated (not replaced), no active → new tab (FR-001-009).
- [X] T006 [US2] Add `tests/e2e/open-in-current-tab.spec.ts` covering the
      acceptance scenarios: clean replace (one tab), dirty new tab (two tabs,
      dirty untouched), untitled replace, existing-tab reactivation, and
      middle-click new tab (US1/2/3).
- [X] T007 [US2] Run `npx playwright test tests/e2e/open-in-current-tab.spec.ts`
      and confirm green.

## Phase 4: Polish

- [X] T008 Run the gates: `npm run lint`, `npm run typecheck`, `npm run test`,
      `npm run test:e2e` (existing tab/close/quit suites must keep passing —
      SC-002).
- [X] T009 Archive the feature (`git mv specs/024-open-in-current-tab
      specs/archive/024-open-in-current-tab`), set the spec's **Status** to
      `Archived`, mark all tasks `[X]`, and update the
      `024-open-in-current-tab` row in `AGENTS.md` to `Archived` / `Complete`.

---

## Dependencies & Execution Order

- T001 → T002 → T003 (reducer → gate → rewiring).
- T004 after T003; T005 after T001; T006/T007 after T003/T004.
- T008 after all; T009 last.

## Implementation Strategy

1. Reducer `mode` + live-dirty gate + dispatch rewiring (unit-tested).
2. Middle-click gesture.
3. e2e acceptance scenarios; gates; archive.
