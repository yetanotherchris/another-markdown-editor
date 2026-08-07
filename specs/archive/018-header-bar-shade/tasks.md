# Tasks: Header Bar Shade

**Feature**: `018-header-bar-shade` | **Date**: 2026-08-07

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [contracts/renderer.md](./contracts/renderer.md)

**Implementation strategy**: A cosmetic, stylesheet-only change. Phase 2 adds
one new design token `--ame-header` (light `#e0e0e0`, dark `#262626`) to
`App.css` and retargets the WYSIWYG editor toolbar (`.milkdown .milkdown-top-bar`)
onto it in `editor.css`. The main app header bar is deliberately NOT changed —
it keeps `--ame-surface` (FR-002; user decision 2026-08-07). Phase 3 proves the
shade relationships end-to-end in `tests/e2e/header-bar-shade.spec.ts`
(light + dark, FR-001…FR-007), reusing the shared `launch.ts` harness. Phase 4
runs the five-command gate. No unit tests: there is no logic, only CSS.

The FR-006 wording (impossible "lighter than the editor content area") is
corrected to "visually distinct from the editor content area" (spec
clarification, 2026-08-07); the `--ame-header` token is recorded as an
amendment to the spec's "no new design tokens" assumption. The initial
implementation also darkened the main app header bar; this was reverted after
the user confirmed the tab bar must keep its colour (decision log, plan.md).

---

## Phase 1: Setup

**Purpose**: Verify the branch baseline before any change.

- [X] T001 Establish a green baseline on the `018-header-bar-shade` branch
      (created from clean `main` per AGENTS.md): run `npm run lint`, `npm run
      typecheck`, `npm run test`, and confirm the e2e suite passes
      (`npm run test:e2e`). Record the results in this file. Confirm the
      artifacts (`spec.md`, `plan.md`, `research.md`,
      `contracts/renderer.md`, `quickstart.md`) are present and consistent.

**Checkpoint**: baseline green; artifacts present.

---

## Phase 2: Implement — the `--ame-header` token and the editor toolbar

**Goal**: the WYSIWYG editor toolbar resolves a shade strictly darker than the
active tab pill in light and dark, with no other element changed
(FR-001…FR-007). The main app header bar stays untouched (FR-002).

- [X] T002 Add the `--ame-header` token to `src/renderer/App.css`: `:root`
      `--ame-header: #e0e0e0` and the `.app-container[data-theme='dark']` block
      `--ame-header: #262626` (research R2 — a dedicated token, because no
      existing `--ame-*` value is both darker than `--ame-active-tab` and safe
      to retarget under FR-005).
- [X] T003 Retarget the WYSIWYG editor toolbar: add `src/renderer/editor/editor.css`
      `.milkdown .milkdown-top-bar { background: var(--ame-header); }` (research
      R1 — a direct override, NOT a `--crepe-color-surface` redefinition, which
      would recolor the table cells and the heading dropdown; R3 — the selector
      matches Crepe's specificity and `editor.css` loads after the Crepe themes).
- [X] T003b Confirm the main app header bar is unchanged: `.header-bar` in
      `src/renderer/chrome/chrome.css` keeps `background: var(--ame-surface)`
      (FR-002 — no edit to `chrome.css`).

**Checkpoint**: `npm run lint`, `npm run typecheck`, `npm run test` pass; the
toolbar resolves `--ame-header` in both themes and the header bar is unchanged.

---

## Phase 3: E2e — shade relationships in light and dark

**Goal**: the feature is proven end-to-end against the built app
(FR-001…FR-007, contracts/renderer.md §E2e).

- [X] T005 Write `tests/e2e/header-bar-shade.spec.ts` (contracts/renderer.md
      §E2e):
      1. Light + one open tab: `.milkdown-top-bar` equals `rgb(224, 224, 224)`
         and is strictly darker than the active pill `rgb(234, 234, 234)`
         (FR-001);
      2. `.header-bar` keeps `rgb(249, 249, 251)` (FR-002);
      3. Active pill stays `rgb(234, 234, 234)`; inactive tab background
         unchanged (FR-003/004);
      4. The toolbar is strictly darker than the canvas `rgb(255, 253, 251)`
         (FR-006);
      5. `.header-bar`, `.sidebar-panel`, `.app-footer`, `.source-toolbar`
         backgrounds unchanged (FR-005);
      6. Dark (Theme → Dark): `.milkdown-top-bar` = `rgb(38, 38, 38)`, darker
         than the dark pill `rgb(45, 45, 45)`, `.header-bar` stays
         `rgb(31, 31, 31)`, canvas stays `rgb(31, 31, 31)` (FR-007);
      7. No tabs: `.header-bar` keeps its existing colour.
      (The existing `tests/e2e/theme.spec.ts` header assertions needed no
      change — the header bar is back to `--ame-surface`.)

**Checkpoint**: `npm run test:e2e` passes, including the new suite.

---

## Phase 4: Gate

**Purpose**: verify consistency and run the full gate.

- [ ] T006 Final gates: `npm run lint`, `npm run typecheck`, `npm run test`,
      `npm run test:e2e`, `npm run check` all green; verify plan/research/
      contracts are consistent with the final code; mark this task `[X]` only
      then.

**Checkpoint**: the five-command gate passes. (NOTE: `npm run check` reports one
pre-existing violation — `src/renderer/state/documents.ts` at 543 lines, the
500-line limit — in a file this feature does not touch.)

---

## Dependencies & Execution Order

| Phase | Depends on | Blocks |
|-------|------------|--------|
| Phase 1: Setup | — | Phase 2 |
| Phase 2: Implement (token + toolbar override) | Phase 1 | Phase 3 |
| Phase 3: E2e | Phase 2 | Phase 4 |
| Phase 4: Gate | Phases 2–3 | — |

### Parallel Opportunities

- Phase 2: T002/T003/T003b touch adjacent files (`App.css`, `editor.css`,
  `chrome.css` untouched) and must run sequentially in order.
- Phase 3: T005 (e2e) depends on the Phase 2 CSS landing; none of the other
  existing suites are touched.

### High-level guarantee

No IPC, no preload, no renderer logic, no editor code. The change is one CSS
rule and one token per theme. The main app header bar, the active/inactive tab,
the sidebar, status footer, source toolbar, and the Crepe non-header surfaces
are untouched (FR-002/003/004/005). The editor toolbar shade is strictly
between the tab pill and the editor canvas in both themes (FR-001/006/007).

---

## Notes

- T002/T003 are both in `src/renderer/` CSS files; no main-process or preload
  changes, so no IPC/security surface is involved (Constitution I/II).
- The exact toolbar value is tuned for a "modest step" (spec edge case) and is
  cheap to change; the e2e relationship checks keep the direction pinned if it
  is retuned.
- Baseline (Phase 1) results: lint, typecheck, and unit tests were green before
  any change; e2e suite green.
- **Scope correction (2026-08-07)**: the first pass darkened `.header-bar`
  too; the user confirmed the tab bar must keep its colour, so that change was
  reverted (`chrome.css` is byte-identical to `main`). See plan.md decision log.
