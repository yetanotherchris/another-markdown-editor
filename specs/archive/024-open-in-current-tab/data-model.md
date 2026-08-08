# Data Model: Open in Current Tab

## Entity: Replace Decision

The single decision that governs whether opening a file replaces the active tab
or creates a new one. Computed by the open handler; executed by the reducer.

| Input | Value |
|-------|-------|
| Target already open in any tab | → activate existing tab (FR-003) — wins over replacement |
| Explicit new-tab action (middle-click) | → `mode: 'new'` (FR-005) |
| Active tab live-clean + target not open | → `mode: 'replace'` (FR-001/009) |
| Active tab live-dirty | → `mode: 'new'` (FR-002) |
| No active tab | → `mode: 'new'` (FR-004) |

"Live-clean" = `isDirtyLive(doc)` is false (pool check; not the debounced flag —
R1, Principle III).

## Reducer transition (`handleOpenExisting`)

```
1. existing tab for value.path? → activate it (unchanged, FR-003).
2. mode === 'replace' AND active tab exists AND !active.dirty?
   → replace the active slot with openFile(value); activeId = new doc id.
3. else → append openFile(value); activeId = new doc id.
```

The replaced document: new id (fresh editor instance), new path/name/content,
`dirty = false`, fresh undo (FR-006/007). The old instance is dropped like a
closed tab's (Assumptions); `enforcePoolCap` evicts as usual.

## Validation rules

- A dirty tab is never replaced (FR-002); close/quit confirmations are
  untouched (SC-002).
- Replacement applies to single-click, double-click, context **Open**, and
  File > Open (FR-008). "View source" keeps its current behaviour.
- An untitled clean tab is replaceable without prompting (FR-009).

## State transitions

None new — the documents reducer gains one branch (`replace`) on `OPEN_EXISTING`.
