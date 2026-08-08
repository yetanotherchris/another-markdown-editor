# Tasks: Improved View Source Icon

**Feature**: `014-view-source-icon` | **Date**: 2026-08-08

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/renderer.md](./contracts/renderer.md), [quickstart.md](./quickstart.md)

**Implementation strategy**: A single CSS rule makes the View source button
distinct; one e2e spec proves it and that the label/behaviour are unchanged.
No component or main-process code changes.

---

## Phase 1: Foundational (Presentation)

- [X] T001 Add the View source distinct-presentation rules to
      `src/renderer/editor/editor.css`: the last `.top-bar-item` inside
      `.top-bar-inner` (the appended view-source button) gets an accent-tinted
      rounded background and its `svg` is coloured with `--mm-accent`, with a
      hover state that stays in the accent family (contract R1-R3; FR-001/002/003/005/006).

## Phase 2: User Story 1 + 2 + 3 - Verification

- [X] T002 [P] [US1] Add `tests/e2e/view-source-icon.spec.ts` asserting the View
      source icon stands out: its computed `color` equals the resolved `--mm-accent`
      token, a formatting control (Bold) keeps the muted outline colour, the button
      carries the `View source` tooltip, and the accent resolves differently (or
      stays effective) across light and dark themes (SC-003/SC-004, FR-004/005).
- [X] T003 [US1] Run `npx playwright test tests/e2e/view-source-icon.spec.ts` and
      confirm green.

## Phase 3: Polish

- [X] T004 Run the gates: `npm run lint`, `npm run typecheck`, `npm run test`,
      `npm run test:e2e` (the existing `source.spec.ts` must keep passing —
      FR-007).
- [X] T005 Archive the feature (`git mv specs/014-view-source-icon
      specs/archive/014-view-source-icon`), set the spec's **Status** to
      `Archived`, mark all tasks `[X]`, and update the `014-view-source-icon`
      row in `AGENTS.md` to `Archived` / `Complete`.

---

## Dependencies & Execution Order

- T001 before T002 (the e2e asserts the CSS actually renders).
- T003 after T002; T004 after T001-T003; T005 last.

## Implementation Strategy

1. Apply the CSS rule.
2. Write + run the e2e assertion.
3. Run all gates; archive the spec.
