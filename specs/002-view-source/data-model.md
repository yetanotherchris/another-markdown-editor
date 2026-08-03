# Phase 1 Data Model: View Source

**Feature**: `002-view-source` | **Date**: 2026-08-02

This feature extends the renderer `Document` state; the main-process model,
Settings and the IPC channel set are unchanged. This document records only the
delta over the parent feature's `data-model.md`.

## Document (renderer) — extended

| Field | Type | Notes |
|-------|------|-------|
| `view` | `'formatted' \| 'source'` | **new.** The editing presentation active in this tab. Defaults to `'formatted'`. Persisted per document across tab switches (per-document view assumption). |
| `editorBaseline` | `string` | **new (late addition 2026-08-03).** The editor's serialization of the content it last parsed, captured by `CAPTURE_BASELINE` right after a (re)mount and set to the saved bytes by `SAVE_SUCCESS`/`RELOAD`/`REFRESH_FROM_SOURCE`. NOT the on-disk bytes (Crepe normalizes); it is the reference the live-dirty check uses to tell normalization from a real edit. |

### View rules

| Rule | Behaviour |
|------|-----------|
| One view per tab (FR-09) | `view` branches the tab's render; at any completed state (and during the slide transition) exactly one editing surface is usable. |
| `content` is the single buffer (FR-10) | Both views feed `UPDATE_CONTENT`. WYSIWYG edits keep arriving debounced (Crepe listener); source edits dispatch `UPDATE_CONTENT` synchronously per keystroke with the textarea's raw value. Dirty is view-aware (2026-08-03): source `dirty = content !== baseline` (raw bytes); formatted `dirty = !markdownSame(content, editorBaseline)` — the formatted content slot holds the editor serialization (always appends one trailing newline, normalizes EOLs), and `editorBaseline` already absorbed that normalization, so a formatted edit undone back to the original stays clean. |
| formatted → source | First flush the live Crepe content into the store (`flushLiveContent` reading `instancePool.getMarkdown`, research R2/R3), then `SET_VIEW {view:'source'}`. The textarea seeds from `document.content`. |
| source → formatted | Compare `instancePool.getMarkdown(id)` with `document.content`. Equal → pure `SET_VIEW` (undo/scroll/cursor preserved via the still-mounted editor). Different → `REFRESH_FROM_SOURCE` (below). |
| Saving from source view | `getContentToSave(id, fallback, doc)` returns raw `document.content` when `doc.view === 'source'` so the written bytes equal what the user sees/edits. Formatted view returns `document.content` when the document is clean (no-edit open/save stays byte-identical, SC-010) and the editor serialization only when it is live-dirty (real edits kept). |
| Live-dirty guard | `isDirtyLive(doc)` = `dirty` OR (formatted view AND the live `getMarkdown()` differs from `editorBaseline`). Source-view docs short-circuit to `dirty` (their content is always current; the mounted editor serializes stale pre-source text). A pristine normalising file is therefore clean. |
| External change / reload | `RELOAD` already replaces content+baseline and bumps `contentVersion`; the source textarea re-seeds from the new `content`, so a reload is reflected in source view too. |

## Reducer actions

| Action | Effect on the target document |
|--------|-------------------------------|
| `SET_VIEW` | `view = payload.view`. No content change. |
| `OPEN_EXISTING` | payload gains optional `view`; a newly opened or reactivated document is created with `view` defaulting to `'formatted'` unless `'source'` is requested (explorer FR-05). |
| `REFRESH_FROM_SOURCE` | `content = payload.content` (== current source text), `cursorOffset = scrollTop = 0`, `contentVersion++` (remounts Crepe). `baseline`/`dirty` untouched — a source edit remains dirty through the return (FR-4). `editorBaseline` is set to the new content as an intermediate value; the remount's `CAPTURE_BASELINE` overwrites it with the exact serialization. |
| `CAPTURE_BASELINE` | `editorBaseline = payload.baseline` (the editor's serialization right after parsing content). `content`/`baseline`/`dirty` are NOT touched — raw-bytes policy. |
| `SAVE_SUCCESS` | `baseline = content = saved bytes` (and `editorBaseline = content`) — the saved document is clean for both the raw-bytes and the live-dirty checks. |

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