# Implementation Plan: Open in Current Tab

**Branch**: `024-open-in-current-tab` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-open-in-current-tab/spec.md`

## Summary

Browsing the explorer no longer fills the tab bar: opening a file replaces the
**active tab** when that tab is clean, and only creates a new tab when the active
tab is dirty (FR-001/002). Existing-tab activation wins over replacement
(FR-003), no-tab and untitled-clean cases replace or create as specified
(FR-004/009), and middle-click explicitly opens a new tab (FR-005). The replaced
tab takes the new file's name/path/content with a fresh editor instance and
fresh undo history (FR-006/007). The rule applies to single-click, double-click,
context-menu **Open**, and File > Open (FR-008).

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: React 19, react-arborist. No new dependencies.

**Storage**: none — session-only behaviour.

**Testing**: Vitest (the `handleOpenExisting` reducer transitions); Playwright e2e (clean-tab replace, dirty-tab new tab, untitled replace, middle-click new tab, existing-tab priority).

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), WYSIWYG markdown editor.

**Performance Goals**: replacement is a single reducer transition + editor remount — same cost as opening a new tab (SC-004).

**Constraints**: Principle III — a tab may ONLY be replaced when it is *live*-clean
(pool check), never a debounced flag, so a keystroke inside the editor's 200 ms
debounce can never be silently discarded. Existing close/quit confirmations are
untouched (SC-002).

**Scale/Scope**: one reducer transition + one session-hook helper + one tree
middle-click path + unit/e2e coverage.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | Renderer-only; no IPC/preload/main change | **PASS** |
| II. Every Path Is Untrusted | No path handling touched | **PASS** |
| III. Never Lose The User's Words | Replacement is gated on the LIVE dirty check (pool), so debounced keystrokes are never lost; dirty tabs always open new tabs; close/quit confirmations unchanged | **PASS** |
| IV. Calm, Predictable Editing | One reducer transition + remount on an explicit click; no keystroke-path work | **PASS** |
| V. Test What Can Corrupt Or Escape | The replace-vs-new decision (the data-loss boundary) gets unit tests for every branch and an e2e suite; existing tab tests must keep passing | **PASS** |

**Post-design re-check**: no principle is violated.

## Phase 1 Design decisions

**The reducer takes an explicit `mode`, computed by the open handler.** The pure
`handleOpenExisting(state, { value, mode })` keeps the existing-tab activation
(FR-003), then: `mode: 'replace'` swaps the active tab's slot for a fresh
`openFile(value)` document (new id → new editor instance, fresh undo, FR-007);
otherwise it appends a new tab. The handler that dispatches decides
`mode` — `'replace'` only when the target isn't already open AND the active tab
is **live-clean** (`isDirtyLive`, the same check close/quit use) AND the open is
not an explicit new-tab action. This keeps the data-loss boundary in the pool-
aware hook, not the pure reducer.

**Replace = swap the slot.** `documents.map(d => d.id === active.id ? openFile(value) : d)`
— the tab keeps its position, the document identity is new (FR-006/007). The old
editor instance is dropped like a closed tab's (Assumptions); `enforcePoolCap`
evicts as usual.

**Middle-click = explicit new tab (FR-005).** The tree row's `onAuxClick`
(`button === 1`) on a file calls an `onOpenNewTab(node)` prop → App reads the
file and dispatches with `mode` forced `'new'`.

**View source is not a browsing open.** The spec's FR-008 list excludes "View
source"; its dispatches keep the current behaviour (activate existing / new tab)
and never replace.

## Project Structure

### Documentation (this feature)

```text
specs/024-open-in-current-tab/
├── spec.md              # Requirements
├── plan.md              # This file
├── research.md          # R1…R3 decisions
├── data-model.md        # Replace decision entity
├── quickstart.md        # Manual verification script
├── contracts/
│   └── open-mode.md     # OPEN_EXISTING mode contract + decision table
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/renderer/state/documents.ts        # OPEN_EXISTING payload {value, mode}; handleOpenExisting replace branch
src/renderer/hooks/useDocumentSession.ts  # NEW openFileFromTree(file, explicitNew) — live-dirty gate
src/renderer/hooks/useWorkspaceTree.ts  # tree select/activate → session.openFileFromTree
src/renderer/hooks/useMenuCommands.ts   # File>Open + recent-open → session.openFileFromTree
src/renderer/hooks/useSourceViewToggle.ts  # handleOpen (context "Open") → session.openFileFromTree
src/renderer/explorer/Tree.tsx          # middle-click → onOpenNewTab
src/renderer/App.tsx                    # onOpenNewTab wiring
tests/renderer/documents.open-replace.test.ts  # NEW: reducer decision matrix
tests/e2e/open-in-current-tab.spec.ts   # NEW: e2e acceptance scenarios
```

**Structure decision**: one new session-hook method is the single gate; the
reducer owns the transition; the tree owns the middle-click gesture.

## Phase status

- Phase 1: Foundational — reducer `mode` + `openFileFromTree` + dispatch rewiring
- Phase 2: US1+US2 — replace vs new behaviour (clean/dirty/untitled)
- Phase 3: US3 — middle-click explicit new tab
- Phase 4: Verification — unit + e2e
- Phase 5: Polish — gates, spec archive, status table

## Deferred / later features

- Ctrl+click modifier as a secondary new-tab trigger (spec Assumptions: "may be added")
- Replacing the active tab with a *view-mode* change (View source) — not a browsing open (FR-008 scope)

## Complexity tracking

None — no principle violated.
