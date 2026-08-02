# Phase 1 Data Model: View Source

**Feature**: `002-view-source` | **Date**: 2026-08-02

This feature extends the renderer `Document` state; the main-process model,
Settings and the IPC channel set are unchanged. This document records only the
delta over the parent feature's `data-model.md`.

## Document (renderer) — extended

| Field | Type | Notes |
|-------|------|-------|
| `view` | `'formatted' \| 'source'` | **new.** The editing presentation active in this tab. Defaults to `'formatted'`. Persisted per document across tab switches (per-document view assumption). |

### View rules

| Rule | Behaviour |
|------|-----------|
| One view per tab (FR-09) | `view` branches the tab's render; at any completed state (and during the slide transition) exactly one editing surface is usable. |
| `content` is the single buffer (FR-10) | Both views feed `UPDATE_CONTENT`. WYSIWYG edits keep arriving debounced (Crepe listener); source edits dispatch `UPDATE_CONTENT` synchronously per keystroke with the textarea's raw value. `dirty = content !== baseline` is unchanged. |
| formatted → source | First flush the live Crepe content into the store (`flushLiveContent` reading `instancePool.getMarkdown`, research R2/R3), then `SET_VIEW {view:'source'}`. The textarea seeds from `document.content`. |
| source → formatted | Compare `instancePool.getMarkdown(id)` with `document.content`. Equal → pure `SET_VIEW` (undo/scroll/cursor preserved via the still-mounted editor). Different → `REFRESH_FROM_SOURCE` (below). |
| Saving from source view | `getContentToSave(id, fallback, doc)` returns raw `document.content` when `doc.view === 'source'` so the written bytes equal what the user sees/edits. Formatted view keeps the `getMarkdown` path. |
| External change / reload | `RELOAD` already replaces content+baseline and bumps `contentVersion`; the source textarea re-seeds from the new `content`, so a reload is reflected in source view too. |

## Reducer actions

| Action | Effect on the target document |
|--------|-------------------------------|
| `SET_VIEW` | `view = payload.view`. No content change. |
| `OPEN_EXISTING` | payload gains optional `view`; a newly opened or reactivated document is created with `view` defaulting to `'formatted'` unless `'source'` is requested (explorer FR-05). |
| `REFRESH_FROM_SOURCE` | `content = payload.content` (== current source text), `cursorOffset = scrollTop = 0`, `contentVersion++` (remounts Crepe). `baseline`/`dirty` untouched — a source edit remains dirty through the return (FR-4). |

## Workspace (renderer)

`WorkspaceState.selectedId` remains the single highlight source driving
`react-arborist`'s `selection`. New behaviour is App-glue only; the reducer is
unchanged:

- activating a tab whose document has a workspace `path` → open that path's
  parents in the tree (via `TreeApi.openParents`, lazy-loaded by the existing
  `onToggle`), scroll it in, and set `selectedId = path` (FR-019/020);
- activating a pathless or external document → `selectedId = null` (FR-021).

No new `TreeNode` fields and no new `WorkspaceAction`.

## Derived state (unchanged / new)

| Value | Derivation |
|-------|-----------|
| WYSIWYG surface visible | `view === 'formatted'` |
| Source surface visible | `view === 'source'` |
| Save payload | `view === 'source' ? content : (instancePool.getMarkdown(id) ?? content)` |
| Crepe remount needed on return | `view was 'source' && document.content !== live instance getMarkdown()` |
| Toolbar labels | ordered const map (research WG) |
| Task backspace eligibility | pure `planTaskBackspace` match (FR-016/017/018) |