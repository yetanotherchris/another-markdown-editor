# Implementation Plan: View Source

**Branch**: `002-view-source` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-view-source/spec.md`

## Summary

Give every open document a second, mutually exclusive editing view: a plain
raw-markdown source editor alongside the existing WYSIWYG Crepe editor. A tab
shows one or the other. Source view is entered from a new "View source" button
in the Crepe top bar (slide-in animation) or from the explorer's file context
menu (which can open an unopen file straight into source); a compact toolbar
in the source view returns to formatted editing. The feature also completes
three related requirements already exercised in the primary spec: explanatory
tooltips on every formatted-editor toolbar control, correct Backspace handling
for empty task-list items, and an explorer highlight that follows the active
tab.

This is a renderer-only feature: the main process, IPC surface, save/close/
quit/external-change rules are untouched (research.md R-process-model).

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: Electron 43 (unchanged), React 19, `@milkdown/crepe` 7.21.3, `@milkdown/kit` 7.21.3, `react-arborist` 3.16. No new runtime dependencies.

**Storage**: unchanged — the user filesystem + settings.json in `userData`.

**Testing**: Vitest 4 (node project for `tests/main`, jsdom for `tests/renderer`); Playwright via `npm run test:e2e` (build + launch).

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), three build targets.

**Performance Goals**: SC-002 — switching to/from source under 1 s for documents up to 10,000 lines; no parse or disk work on the source keystroke path (SC-004), keystroke-to-glyph under 50 ms.

**Constraints**: Renderer sandboxed (no Node); all disk I/O in main; atomic saves; source keystroke path does no formatting work; reduced-motion honoured.

**Scale/Scope**: Single window, ~10 open documents, one view per tab; CLI, packaging and syntax highlighting out of scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | New code is renderer-only; explorer/toolbar actions use existing IPC; no new channel, no `invoke` escape | **PASS** — research.md R-Process-model |
| II. Every Path Is Untrusted | No path handling is changed; tree/editor highlight only maps reducer state | **PASS** |
| III. Never Lose The User's Words | Source edits flush through `UPDATE_CONTENT`; a failed view-return keeps the raw text and leaves the tab dirty; save of a source tab writes raw text; REVIEW: what happens to a source tab with uncommitted edits when the WYSIWYG editor was rebuilt? (research R3 ensures rendered text == textarea, no discard) | **PASS** |
| IV. Calm, Predictable Editing | No work on the keystroke path; reduced-motion slide; per-tab view persisted; switching back with no edits preserves undo/scroll | **PASS** |
| V. Test What Can Corrupt Or Escape | View-switch reducer tests, task-backspace pure tests, toolbar-label equality, full e2e suite at `tests/e2e/source.spec.ts` | **PASS** — R-Process note plus the tasks |

**Post-design re-check**: no principle is violated. See Complexity Tracking for
the one deliberate engineering trade.

## Phase 1 Design decisions

**Renderer-only**; the reducer gains a `view: 'formatted' | 'source'` field on
each `Document`, and three actions: `SET_VIEW`, `OPEN_EXISTING` open-in-source
(accepted as an action payload flag), and `REFRESH_FROM_SOURCE` (bumps
`contentVersion` to remount Crepe with the new text, keeping baseline/dirty).
Source textarea content is dispatched straight into `UPDATE_CONTENT`, the same
store path formatted edits use; `dirty = content !== baseline` is unchanged.

**View switching** (research R3): formatted→source syncs live Crepe content
into the store first; source→formatted compares the live instance's
`getMarkdown()` to `document.content` and only remounts when they differ.
This preserves undo/scroll/cursor for the no-edit round trip and never
discards a source change.

**The new "View source" button** is added to the Crepe top bar through the
`featureConfigs['top-bar'].buildTopBar(groupBuilder)` hook, which Crepe calls
after building the default groups (verified, research R-7). The toolbar tooltip
work uses a stable order-based label map applied to the top-bar controls after
mount (research WG). The source view's own compact toolbar hosts the labeled
"Back to visual editing" return control.

**The explorer active-tab highlight** — `workspace.selectedId` is the existing
selection source; activating a tab with a workspace path now *drives* that
selection (opening parents via the tree api and scrolling, or clearing it for a
pathless doc). No workspace reducer change.

**Task-list Backspace** — a filtered keydown handler on the ProseMirror DOM
inside `CrepeHost` intercepts exactly the "start of empty task item" case and
removes the item (or the whole list when it is the only child); everything else
falls through (R-Task, FR-017/018).

**Source-return round-trip guard (FR-12)** — returns to the visual editor only
from a *changed* source compare for the normalization check; when the parsed
output differs from the typed text a quiet, dismissible in-context banner is
shown; raw text is always preserved in `content` and in the textarea.

## Project Structure

### Documentation (this feature)

```text
specs/002-view-source/
├── spec.md              # Requirements
├── plan.md              # This file
├── research.md          # R1…R-Process decisions
├── data-model.md        # Document <view> field etc.
├── quickstart.md        # Manual verification script
├── contracts/
│   └── renderer.md      # New renderer-only contract + unchanged IPC note
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/renderer/
├── state/documents.ts           # + `view` field, SET_VIEW, OPEN_EXISTING-in-source, REFRESH_FROM_SOURCE
├── editor/
│   ├── CrepeHost.tsx            # + featureConfigs top-bar buildTopBar, toolbar-label pass, task-backspace keydown
│   ├── EditorPanel.tsx          # choose + blend formatted/source layers per document
│   ├── SourceView.tsx           # NEW: textarea + compact toolbar + return button
│   ├── toolbarLabels.ts         # NEW: ordered label map for top-bar controls
│   └── taskBackspace.ts         # NEW: pure `planTaskBackspace` helper + prosemirror wiring
├── explorer/Tree.tsx           # + onViewSource when the node is a file; optional apiRef
├── App.tsx                     # view switch handlers, explorer-active selector, tab-highlight
└── App.css                     # slide-in animation, source toolbar/panel, reduced-motion

tests/
├── renderer/
│   ├── documents.test.ts       # extended: view field / actions
│   └── taskBackspace.test.ts    # NEW: pure backspace decision fn
└── e2e/
    └── source.spec.ts            # NEW: Playwright coverage of all six stories + edges
```

**Structure decision**: the feature lives inside `src/renderer` only; the
added files mirror the existing editor and explorer folders, keeping the
"main/ preload/ renderer/" process boundary auditable.

## Phase status

- Phase 1: Setup (foundations for the feature; renderer-only, no new deps)
- Phase 2: Foundational (DocumentState view plumbing, reducer actions)
- Phase 3: US1 — formatted→source toolbar + slide animation
- Phase 4: US2 — explorer View source (open/un-open file)
- Phase 5: US6 — explorer active-file highlight
- Phase 6: US3 — return to formatted control (+ round-trip guard FR-12)
- Phase 7: Cross-cutting — tooltips (US4), task backspace (US5), e2e, polish

## Deferred / later features

- Packaging, GFM source, find/replace and syntax highlighting
- Stricter "unparseable" detection beyond the round-trip banner
- Toolbars beyond the single return button (spec assumptions)

## Complexity tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| A second DOM editor (a textarea) plus keeping the Crepe editor mounted underneath during source view | Crepe can't change content without a remount (R1 of 001), the WYSIWYG must keep undo/scroll across a no-edit return, and source needs plain text | Remounting WYSIWYG on every switch (drops undo/scroll on a no-edit round trip); a second Crepe instance for source (reparse-only, no raw-edit surface) |
| Comparing exact `getMarkdown()` vs `document.content` to decide the remount | keeps Principle IV: a no-edit round trip is a pure visibility swap | Remounting always (FR-11 core) is wasteful; never remounting cannot reflect source edits (FR-11 core) |