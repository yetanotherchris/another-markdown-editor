# Renderer Contract: View Source

**Feature**: `002-view-source` | **Date**: 2026-08-02

The IPC surface and preload API are **unchanged** (see the parent feature's
`contracts/preload-api.md` and `contracts/ipc-channels.md`). This contract
describes the renderer-internal operations this feature adds and the exact
reuse of existing channels — the separation keeps the principle-I surface
stable and auditable.

## Existing IPC surface reused (no new channels)

| Call | Used by |
|------|---------|
| `readFile(path)` | explorer "View source" on an unopened file (FR-05) |
| `openFolderDialog` / `readDir` | untouched |
| `writeFile` / `saveFileDialog` | the existing save/close/quit flows; save payload comes from the renderer's `getContentToSave` |
| `onDocumentChanged`, `workspace:changed`, `onQuitRequested` | untouched |

## Renderer-internal contract

All of the following operate purely on renderer state. The main process is not
involved.

```text
state/Document.view                 : 'formatted' | 'source'
state/Document.editorBaseline      : string (editor serialization reference for the live-dirty check; see data-model.md)
documentsReducer actions            : SET_VIEW | OPEN_EXISTING (with .view) | REFRESH_FROM_SOURCE | CAPTURE_BASELINE (stores editorBaseline)
EditorPanel                          : renders formatted layer + (when view==='source') SourceView overlay
SourceView                           : props { value, onChange, onReturnToFormatted, labelled by FR-08 }
CrepeHost extra props               : onRequestViewSource (wired via top-bar buildTopBar)
Tree extra props                    : onOpen(node) | onViewSource(node)  // file nodes only
App glue:
  showSource(tab)                   : flushLiveContent, SET_VIEW source
  returnToFormatted(tab)            : conditional REFRESH_FROM_SOURCE, SET_VIEW formatted
  openInSource(path)                : readFile + OPEN_EXISTING{view:'source'} (+ enforcePoolCap)
  openInFormatted(path)             : ACTIVATE existing (source→formatted via returnToFormatted) or readFile + OPEN_EXISTING{view:'formatted'}
  activeTabExplorerHighlight()      : openParents + scroll + SELECT / SELECT null
  isDirtyLive(doc)                 : dirty || (formatted && live ≠ editorBaseline); source docs = dirty
toolbarLabels util                : ordered map of control → {title, ariaLabel}
taskBackspace util               : planTaskBackspace(EditorState) → boolean (handled) / void
```

## Error and edge behaviour

- `Refusing the return when the WYSIWYG editor never mounted`: if `view ===
  'source'` but there is no Crepe instance (cross-window the instance was
  evicted), `getMarkdown` returns null → treat as "different" → remount, which
  recreates the editor; the text is never lost.
- FR-12's preservation branch: source text is always retained in `content` and
  in the textarea while in source view. The "explain in context" banner is
  removed (deferred 2026-08-03 — see the note under FR-012 in spec.md).
- A pristine normalising file is clean for the close/quit guards and a no-edit
  open/save writes the raw stored bytes (SC-010, `editorBaseline` reference).

## Tests that must exist

- `tests/renderer/documents.test.ts` → cover SET_VIEW and REFRESH_FROM_SOURCE.
- `tests/renderer/taskBackspace.test.ts` → pure unit coverage of the decision fn.
- `tests/e2e/source.spec.ts` → the six user stories + edge cases, run with `npm run test:e2e`.