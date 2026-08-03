# Tasks: Native Explorer

**Feature**: `003-native-explorer` | **Date**: 2026-08-03

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Implementation strategy**: an appearance + context-placement feature over the
Phase 1–6 base. Phase 1 verifies the baseline and the two new bundled
dependencies; Phase 2 puts the workspace path + `shortenPath` helper in place
(foundational); then the user stories land in priority order. The tree-icon and
toolbar-icon tasks touch different files and are `[P]`-parallel; the footer
tasks run sequentially because they edit `App.tsx`/`App.css`. Per the
constitution, every user-visible behaviour gets e2e coverage in
`tests/e2e/native.spec.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: A green baseline to measure against and verified bundled assets
(icons + font) that the story phases consume.

- [X] T001 Establish a green baseline: run `npm run lint`, `npm run typecheck`,
      `npm run test` on the `003-native-explorer` branch and record the result
      in this file
- [X] T002 Install `lucide-react` (ISC) and `@fontsource/inter` (OFL-1.1);
      verify the font woff2 assets exist under `node_modules/@fontsource/inter`

**Checkpoint**: baseline green; both packages install cleanly.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Goal: the renderer can render the workspace's full path before any story needs it.**

- [X] T003 Add `path: string | null` to `WorkspaceInfo` in
      `src/shared/ipc-contract.ts`; return `path: workspaceRoot` from
      `workspace:openDialog` in `src/main/ipc/handlers.ts` (research R-Path);
      populate `WorkspaceState.root` in both `REPLACE` dispatches in
      `src/renderer/App.tsx` (menu "Open Folder" + toolbar handler)
- [X] T004 [P] Implement `src/renderer/status/shortenPath.ts` — pure
      `shortenPath(path, maxLength)` that returns the full path when it fits
      and otherwise keeps the final folder name whole with a `…` prefix
      (research R4)
- [X] T005 [P] Extend `tests/main/ipc.test.ts` — the WorkspaceInfo shape test
      now includes `path`; add `tests/renderer/shortenPath.test.ts` (full-fit,
      short-tail, final-folder survival, tiny-width floor, `\` vs `/`,
      no-separator input)

**Checkpoint**: `npm run test` main + renderer projects pass with the new field
and helper.

---

## Phase 3: User Story 1 — Navigate a familiar-looking workspace (P1)

**Goal**: folders, files and hierarchy controls use a cohesive, recognizable
desktop icon language (FR-001/002/003).

**Independent Test**: Quickstart (1–2).

### Implementation

- [X] T006 [US1] `src/renderer/explorer/Tree.tsx` — replace the emoji and
      unicode-triangle glyphs with lucide icons: `Folder`/`FolderOpen` for
      directories, `FileText` for files, `ChevronRight`/`ChevronDown` for the
      toggle; decorative icons `aria-hidden`, toggle keeps `role="button"`
      + `aria-label` "Expand"/"Collapse"
- [X] T007 [US1] `src/renderer/explorer/Tree.css` — icon/toggle sizing aligned
      to the existing row, and a `:focus-visible` ring on the toggle (FR-013)

**Acceptance**: folder icon changes on expand; chevron communicates
expand/collapse; keyboard focus is visible.

---

## Phase 4: User Story 2 — Use explorer actions without text-heavy controls (P2)

**Goal**: the create and open-folder toolbar controls use recognizable icons
with an accessible text name (FR-004/005).

**Independent Test**: Quickstart (3).

### Implementation

- [X] T008 [US2] `src/renderer/App.tsx` — the **New** button gains a `Plus`
      icon and **Open Folder** a `FolderOpen` icon (both `aria-hidden`,
      visible text labels retained so the accessible names and existing e2e
      locators are unchanged); `src/renderer/App.css` — icon+label button layout

**Acceptance**: icons present and identifiable; keyboard focus exposes the
purpose through the text label (US2 acceptance 3).

---

## Phase 5: User Story 3 — See current document and workspace at a glance (P1)

**Goal**: a persistent footer replaces the header's context display
(FR-008…012).

**Independent Test**: Quickstart (4–6).

### Implementation

- [X] T009 [US3] `src/renderer/status/StatusFooter.tsx` — footer with a left
      `.document-title` region (active doc title + dirty marker, muted
      "No document open" when none) and a right `.footer-workspace` region
      (`shortenPath(root, maxChars)` with `title` tooltip, muted "No folder
      open" when no workspace); `maxChars` from `useElementSize` (research R4)
- [X] T010 [US3] `src/renderer/App.tsx` — render `StatusFooter` at the bottom
      of `.app-container`; remove the `.document-title` and `.workspace-name`
      spans from the `.toolbar` (FR-011)
- [X] T011 [US3] `src/renderer/App.css` — footer bar layout, muted placeholder
      styling, overflow protection on the workspace label (FR-010, SC-004)

**Acceptance**: footer left follows the active tab; footer right shows the full
path or a `…`-shortened form keeping the final folder; header no longer shows
the active file; no-workspace/no-document placeholders are shown.

---

## Phase 6: User Story 4 — Read the interface comfortably offline (P2)

**Goal**: the whole interface uses a bundled sans-serif typeface and the icons
render without a network connection (FR-006/007).

**Independent Test**: Quickstart (7).

### Implementation

- [X] T012 [US4] `src/renderer/main.tsx` — import `@fontsource/inter/400.css`
      and `@fontsource/inter/600.css`
- [X] T013 [US4] `src/renderer/App.css` — `font-family: 'Inter', …` on
      `html, body`; override `--crepe-font-default` and `--crepe-font-title`
      on `.milkdown` so editor body + headings share Inter (research R2)

**Acceptance**: Inter is applied to chrome and editor; the woff2 files live in
the renderer build (no remote src).

---

## Phase 7: Cross-cutting — e2e, polish, gates

- [X] T014 Write the Playwright suite `tests/e2e/native.spec.ts` covering US1–4
      + edges (offline font check via `document.fonts.check`, icon presence,
      footer left/right updates, shortening, placeholders) — run with
      `npm run test:e2e`
- [X] T015 [P] Run quickstart.md smoke and full `npm run lint`,
      `npm run typecheck`, `npm run test`, `npm run test:e2e`; review
      plan/research/data-model/contracts consistency

**Checkpoint**: `npm run test:e2e` all green alongside lint/typecheck/vitest.

---

## Dependencies & Execution Order

| Phase | Depends on | Blocks |
|-------|-----------|--------|
| 1 Setup | — | 2 |
| 2 Foundational | 1 | 3–6 |
| 3 US1 (P1) | 2 | 7 |
| 4 US2 (P2) | 2 | 7 |
| 5 US3 (P1) | 2 + T004 | 7 |
| 6 US4 (P2) | 1 | 7 |
| 7 Polish | all | — |

### Parallel Opportunities

- T004 (shortenPath) and T005 (tests) are independent of T003 (path plumbing)
  but both belong to Phase 2; T004 before T005.
- T006/T007 (tree) and T008 (toolbar) touch disjoint files — `[P]`.
- The e2e suite (T014) touches `tests/e2e/` only; run it after T013.

### High-level guarantee

The reducer models and fs paths are untouched; the only main-process change is
the additive `path` field on the existing workspace dialog response. All visible
work is chrome + context placement.

---

## Notes

- [P] tasks touch disjoint files; the remaining tasks are sequential because
  they edit the same `App.tsx`/`App.css` surface.
- Every task leaves the repo in `npm run typecheck`-clean state.
- Deviations from the research/plan must be written there per AGENTS.md
  before continuing.
- The security and data-loss invariants (path guard, atomic save, dirty
  prompts) are untouched — this feature changes presentation and context
  placement only.
- MVP = end of Phase 5; the rest are increments.
