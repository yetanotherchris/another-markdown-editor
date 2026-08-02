# Tasks: View Source

**Feature**: `002-view-source` | **Date**: 2026-08-02

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Implementation strategy**: renderer-only feature over the Phase 1–6 base.
Phase 1 verifies the baseline and seeds the two self-contained helpers; Phase 2
puts the reducer's `view` field and actions in place (foundational); then the
user stories land in priority order. Because US1–US3/US6 are knotted together
in `App.tsx`/`EditorPanel.tsx`, those tasks run sequentially (they touch the
same files); the pure helpers (`toolbarLabels.ts`, `taskBackspace.ts`) stay
`[P]`-parallel. Per the constitution, every user-visible behaviour gets e2e
coverage in `tests/e2e/source.spec.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: A green baseline to measure against, and the two dependency-free
helper modules that the user-story phases will consume.

- [ ] T001 Establish a green baseline: run `npm run lint`, `npm run typecheck`,
      `npm run test` on a clean checkout and record the result in this file
- [ ] T002 [P] Implement `src/renderer/editor/toolbarLabels.ts` — ordered const
      map of Crepe top-bar control label → { label } and an
      `applyToolbarLabels(container)` helper that assigns `title` + `aria-label`
      to the heading selector and each `top-bar-item` button (research WG)
- [ ] T003 [P] Implement `src/renderer/editor/taskBackspace.ts` — a pure
      `planTaskBackspace(state)` that flags Backspace-eligible empty task items
      (start of an empty `list_item` with `checked` attr) and returns either a
      removal transaction to run or `null` (research R-Task)

**Checkpoint**: baseline green; both helpers compile (`npm run typecheck`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Goal: The reducer knows about views before any story renders one.**

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [ ] T004 Implement the `view` field (`'formatted' | 'source'`,
      default `'formatted'`), the `SET_VIEW` action, the optional `view`
      payload on `OPEN_EXISTING`, and the `REFRESH_FROM_SOURCE` action
      (contentVersion bump, `baseline`/`dirty` untouched) in
      `src/renderer/state/documents.ts`
- [ ] T005 [P] Extend `tests/renderer/documents.test.ts`: SET_VIEW no-op cases,
      dirty preserved across REFRESH_FROM_SOURCE, OPEN_EXISTING with `view`,
      dedupe-on-open behaviour unchanged (FR-6/14)

**Checkpoint**: `npm run test` renderer project passes with the new reducer.

---

## Phase 3: User Story 1 — Edit raw markdown in an open document (P1) 🎯

**Goal**: View source from the formatted toolbar slides raw text in over the
editor; edits drive the same dirty state as formatted edits.

**Independent Test**: Quickstart (1–2): open a doc, click **View source**, edit
markdown, see dirty marker, return.

### Implementation

- [ ] T006 [US1] Wire the Crepe top bar in `src/renderer/editor/CrepeHost.tsx`:
      pass `featureConfigs['top-bar'].buildTopBar` that appends a **View source**
      item (its own group) calling a new `onRequestViewSource` prop; run
      `applyToolbarLabels` once the bar exists
- [ ] T007 [US1] Implement `src/renderer/editor/SourceView.tsx` — plain
      monospace `<textarea>` bound to `document.content` (dispatch in App) +
      compact toolbar with a clearly labelled return control
- [ ] T008 [US1] Extend `src/renderer/editor/EditorPanel.tsx` to render the
      source layer over the editor host when `document.view === 'source'`,
      keeping the Crepe host mounted (visibility hidden)
- [ ] T009 [US1] `src/renderer/App.tsx` — `flushLiveContent`/`getLiveContent`/
      `getContentToSave` branch on `viewMode` so source tabs read raw
      `document.content`; add `handleShowSource(id)` (flush, `SET_VIEW`) and
      wire `onRequestViewSource` down to it
- [ ] T010 [US1] `src/renderer/App.css` — `.source-view` slide-in from the right
      (160 ms keyframes) over the host, `prefers-reduced-motion: reduce` → none,
      source toolbar top styling

**Checkpoint**: a file opens, the top bar shows **View source**, switching to
source animates the slide, editing in the textarea marks the tab dirty.

---

## Phase 4: User Story 2 — Open a file directly in source view (P2)

**Goal**: Explorer context-menu **View source** opens (or re-activates) a file
in source view without duplicating a tab.

**Independent Test**: Quickstart (3).

### Implementation

- [ ] T011 [US2] Extend `src/renderer/explorer/Tree.tsx` with an
      `onViewSource(node)` prop and a **View source** menu item for file nodes
- [ ] T012 [US2] `src/renderer/App.tsx` — `handleOpenInSource(path)`: 
      `readFile` → `OPEN_EXISTING {view:'source'}` (activating+dedup) →
      `enforcePoolCap(active)`

**Acceptance** FR-05/06: un-open file opens in source tab; already-open file
activates existing tab and slides to source; already-source file reactivates.

---

## Phase 6: User Story 6 — Identify the active file in the explorer (P2)

**Goal**: The active tab's file is highlighted in the explorer, following tab
changes, revealing nested files, and clearing for pathless tabs.

**Independent Test**: Quickstart (7).

### Implementation

- [ ] T013 [US6] Extend `src/renderer/explorer/Tree.tsx` with an optional
      `treeRef` callback so App can open parents / scroll / select a path
- [ ] T014 [US6] `src/renderer/App.tsx` — on active-tab change: when the
      active doc has a workspace `path`, `openParents(path)` + `scrollTo(path)`
      + `SELECT {path}`; when pathless, `SELECT {null}` (FR-021)

**Acceptance**: switching tabs moves the tree highlight; nested files revealed;
untitled tab clears the highlight; file rename/move still updates the highlight
via existing REROUTE/derivates.

---

## Phase 6b: User Story 3 — Return to formatted editing (P3)

**Goal**: The source toolbar's return control switches back, preserving edits
(fresh remount when changed) and the dirty state; unrepresentable text shows an
in-context note (FR-12).

**Independent Test**: Quickstart (4, 8).

### Implementation

- [ ] T015 [US3] `src/renderer/App.tsx` — `handleReturnToFormatted(doc)`:
      compare `content` with live `getMarkdown()`; equal → `SET_VIEW`;
      differs → `REFRESH_FROM_SOURCE` (bumps version to remount) then
      `SET_VIEW`; wire the SourceView return button and the toolbar return
- [ ] T016 [US3] Round-trip guard + banner in `EditorPanel`/`App`: when the
      parsed output differs from the raw source and the doc is dirty, show a
      quiet dismissible note ("visual editor normalises…", FR-12) — preserved
      raw text, never destructive

**Acceptance**: return with no edits is a pure visibility swap (undo/scroll
kept); return after edits replaces the content and the dirty marker stays.

---

## Phase 7: Cross-Cutting — tooltips, task-list Backspace, e2e, polish

**Goal** US4 (tooltip on every formatted toolbar control), US5 (empty
task-list item Backspace), plus the required e2e suite and final validation.

- [ ] T017 [P] [US4] US4 completes — the toolbarLabels pass in
      `CrepeHost.tsx` covers every control incl. the heading selector and the
      new **View source** button (title on hover + focus, aria-label)
- [ ] T018 [P] [US5] Wire `planTaskBackspace` to the `.ProseMirror` keydown in
      `src/renderer/editor/CrepeHost.tsx` (capture), restoring ordinary
      Backspace behavior elsewhere (FR-018)
- [ ] T019 [P] [US5] Unit tests for `planTaskBackspace` in
      `tests/renderer/taskBackspace.test.ts` (empty item removal, sole-item
      list collapse, non-empty preservation), and unit checks for the toolbar
      label map
- [ ] T020 Write the Playwright suite `tests/e2e/source.spec.ts` covering all
      six user stories + edges (reduced-motion slide, tab-switch mid-view,
      close/quit with dirty source, FR-12 banner, active-highlight clear,
      tooltip-a11y) — run with `npm run test:e2e`
- [ ] T021 [P] Run quickstart.md smoke and full `npm run lint`,
      `npm run typecheck`, `npm run test`, `npm run test:e2e`; review
      plan/research/data-model/contracts consistency; mark every task [X]

**Checkpoint**: `npm run test:e2e` all green alongside lint/typecheck/vitest.

---

## Dependencies & Execution Order

| Phase | Depends on | Blocks |
|-------|-----------|--------|
| 1 Setup | — | 2 |
| 2 Foundational | 1 | 3–7 |
| 3 US1 (P1) | 2 | 7 (polish) |
| 4 US2 (P2) | 2 | — |
| 6 US6 (P2) | 2 + tree | — |
| 6b US3 (P3) | 3 (source view + toolbar) | 7 |
| 7 Polish | all | — |

### Parallel Opportunities

- Within Phase 1: `toolbarLabels.ts` and `taskBackspace.ts` are independent
  ([P]).
- Phase 2 test task writes against the same file as implementation — same
  sequence, T005 after T004.
- `taskBackspace` wiring (T018) is independent of the App-phase threads.
- The e2e suite (T020) touches `tests/e2e/` only; run it after T018.

### High-level guarantee

The reducer gates every view change; the visible work per story is purely
UI/labels. No main-process, IPC, or preload file is modified in any task.

---

## Notes

- [P] tasks touch disjoint files; the remaining tasks are sequential because
  they edit the same `App.tsx` / `EditorPanel.tsx`/`CrepeHost.tsx` surface.
- Every task leaves the repo in `npm run typecheck`-clean state.
- Deviations from the research/plan must be written there per AGENTS.md
  before continuing.
- The security and data-loss invariants (path guard, atomic save, dirty
  prompts) are untouched — a source-edit tab flows through the exact same
  path with close/quit/delete in the existing code.
- MVP = end of Phase 3; the rest are increments.