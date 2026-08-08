# Research: Open in Current Tab

## R1 — The live-dirty gate lives in the pool-aware hook, not the reducer

**Decision**: the open handler (`useDocumentSession.openFileFromTree`) decides
`mode: 'replace' | 'new'` using `isDirtyLive` (the pool check), and the pure
reducer only executes it.

**Rationale**: the store's `dirty` flag is updated by a 200 ms debounce (spec
002), so a keystroke inside that window leaves `dirty === false` in the store
while the editor is actually dirty. Replacing based on the stored flag would
silently discard the typed text — a direct Principle III violation. `isDirtyLive`
(the same check the close/quit guards use) reads the live editor serialization
against `editorBaseline`, so the gate is exact. The reducer stays pure and
electron-free (unit-testable); the data-loss boundary stays in the hook that owns
the pool.

**Alternatives considered**: gating in the reducer on `d.dirty` (rejected —
debounce window data loss); gating in the reducer with a passed-in `isLiveClean`
flag (rejected — couples the pure reducer to the pool; the hook already has it).

## R2 — Replace swaps the tab slot for a fresh document

**Decision**: `documents.map(d => d.id === active.id ? openFile(value) : d)` with
`activeId = newDoc.id`.

**Rationale**: a fresh `openFile` gives a new id (for saved files, the id is the
path), which keys a brand-new editor instance — satisfying FR-006/007 (new name,
path, content, clear dirty, fresh undo) with zero extra machinery. The tab keeps
its position; the old instance is dropped exactly like a closed tab's
(Assumptions), and `enforcePoolCap` evicts as usual.

**Alternatives considered**: mutating the active document in place (rejected —
reusing the id would reuse the editor instance's undo/baseline, violating FR-007).

## R3 — Middle-click via the tree row's `onAuxClick`

**Decision**: the row's `onAuxClick` (only when `e.button === 1`) on a file node
calls `onOpenNewTab(node)` → App reads the file and dispatches with
`mode: 'new'`.

**Rationale**: react-arborist's `handleClick`/`onActivate` do not fire for middle
clicks, so the gesture needs an explicit handler. `button === 1` is the browser
middle-button convention (Assumptions). Only file nodes qualify (FR-005).

**Alternatives considered**: Ctrl+click (rejected for now — the spec marks it as
a possible secondary trigger, and browsers reserve it); a context-menu item
(rejected — middle-click is the specified primary).
