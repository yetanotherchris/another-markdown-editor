# Phase 1 Data Model: Desktop Markdown Editor

**Feature**: `001-markdown-editor` | **Date**: 2026-08-01

All state is in memory except `Settings`, which persists to Electron's
`userData`. There is no database. Entity names map to the Key Entities section
of [spec.md](./spec.md).

## Workspace (main process)

The opened folder. Zero or one exists.

| Field | Type | Notes |
|-------|------|-------|
| `rootRealPath` | `string` | Absolute, `fs.realpath`-resolved once at open time. **The** containment reference. |
| `openedAt` | `number` | Epoch ms. |

Rules:

- Resolved once at open. Never re-derived per operation, so a symlink swapped
  underneath cannot silently move the boundary.
- Opening a folder replaces any existing workspace (spec Assumptions: single
  workspace).
- If `rootRealPath` becomes unreadable, the workspace enters an `unavailable`
  state; the tree is marked stale rather than cleared, and file operations fail
  with `NOT_FOUND` (spec edge case: folder removed while in use).

## TreeNode (renderer)

A folder or markdown file shown in the explorer. Presentation only — mutations
go through IPC.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | Workspace-relative POSIX-style path. Stable identity for `react-arborist`. |
| `name` | `string` | Display name. |
| `kind` | `'file' \| 'directory'` | |
| `children` | `TreeNode[] \| null` | `[]` = directory not yet loaded or loaded and empty (lazy, research.md R14; `null` is used for files). |
| `loadState` | `'unloaded' \| 'loading' \| 'loaded' \| 'error'` | Drives spinner and retry affordance. |

Rules:

- Only directories and `.md`/`.markdown` files exist as nodes. Filtering happens
  in main (FR-010); the renderer never learns of other files.
- A directory containing no markdown files still appears (FR-010a).
- `id` uses `/` separators on all platforms so tree identity is
  platform-independent. Conversion to native separators happens in main.
- Symlinked directories are not traversed (research.md R14), which also resolves
  the symlink-loop edge case.

## Document (renderer)

An open piece of content. Backs one tab.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | Stable for the document's lifetime. See identity rules below. |
| `path` | `string \| null` | Workspace-relative. `null` = never saved (FR-019). |
| `title` | `string` | Filename, or `Untitled-N` when `path` is `null`. |
| `baseline` | `string` | Markdown as of last load or save. Dirty comparison reference. |
| `content` | `string` | Current markdown from Crepe. |
| `dirty` | `boolean` | Derived: `content !== baseline`. Never set directly. |
| `diskBytes` | `string \| null` | Exact bytes read from disk, retained for the SC-006 no-op-save guarantee. |
| `editorState` | `'live' \| 'evicted'` | `evicted` = Crepe instance destroyed, content retained (research.md R2). |
| `cursorOffset` | `number` | Restored on reactivation. |
| `scrollTop` | `number` | Restored on reactivation. |
| `lastActiveAt` | `number` | LRU ordering key. |
| `externalState` | `'clean' \| 'changedOnDisk' \| 'deletedOnDisk'` | Drives FR-035–FR-038 handling. |
| `contentVersion` | `number` | Bumped on every `RELOAD`; keys the `CrepeHost` remount so external content actually replaces the live editor (Crepe accepts content only at construction, R1). |

### Identity rules

- Documents are keyed by `path` while saved, so opening an already-open file
  activates the existing tab (FR-016).
- Comparison uses the **resolved** path, so `./notes/a.md` and `notes/a.md`
  match.
- On rename or move within the app, `path` and `title` update in place and `id`
  is retained, so the tab does not close and reopen (FR-028).
- Never-saved documents get a generated id; on first save they adopt the path.
  If that path is already open, the save is refused as `CONFLICT` rather than
  producing two tabs for one file.

### Dirty rules

- `dirty` is always derived from `content !== baseline`, so undoing back to the
  original state clears the marker (research.md R4).
- `baseline` is captured from `crepe.getMarkdown()` immediately after the
  editor is created, not from the file bytes and not from a "first emission"
  (which never fires — see research.md R4): Crepe normalises on parse and
  every file would otherwise open dirty. `CAPTURE_BASELINE` adopts the
  normalised value as both `content` and `baseline`.
- The reducer's `dirty` lags keystrokes by the listener plugin's 200 ms
  debounce. The close-tab and quit guards therefore also consult the **live**
  editor content (`getMarkdown() !== baseline`) and flush it into the reducer
  before deciding — closing within the debounce window must still prompt
  (FR-023, research.md R4).
- A failed save does **not** update `baseline` — the document stays dirty
  (FR-022, Principle III).
- Saving a document where `dirty === false` writes nothing at all, which is what
  guarantees SC-006.

### Lifecycle

```text
                  open file
                      │
                      ▼
   ┌──── live, clean ──────► live, dirty ────┐
   │          │  ▲               │  ▲        │
   │   evict  │  │ reactivate    │  │        │ save ok
   │  (LRU)   ▼  │               │  └────────┘
   │       evicted                │
   │                              │ save fails → stays dirty
   └──────────── close ───────────┘
                  │
       dirty? confirm save/discard/cancel
```

Only clean documents may be evicted (judged against live editor content, not
just the debounced reducer flag — research.md R4). Eviction of a dirty document
would put the only copy of the user's work nowhere, breaching Principle III.
An evicted document renders as an empty container until reactivation, when a
fresh editor instance is created and its retained cursor and scroll position
are restored.

## EditingSession (renderer)

| Field | Type | Notes |
|-------|------|-------|
| `documents` | `Document[]` | Tab order, left to right. |
| `activeId` | `string \| null` | `null` when nothing is open. |
| `untitledCounter` | `number` | Feeds `Untitled-N`. |

Rules:

- Closing the active document activates its right-hand neighbour, or the
  left-hand one if it was last.
- Quitting with any dirty document prompts once, listing every affected title
  (FR-023), and is cancellable.

## Settings (main, persisted)

| Field | Type | Default |
|-------|------|---------|
| `sidebarWidth` | `number` (percentage of window width) | `30` |
| `themeOverride` | `'light' \| 'dark' \| null` | `null` (follow OS, research.md R10) |
| `lastWorkspacePath` | `string \| null` | `null` |

Rules:

- Written debounced (500 ms) so dragging the divider does not thrash the disk.
- Corrupt or unreadable settings fall back to defaults without blocking startup.
- `lastWorkspacePath` is recorded but **not** auto-reopened — session restore is
  out of scope per spec Assumptions. It seeds the folder picker's start
  directory only.

## WatchEvent (main → renderer)

| Field | Type | Notes |
|-------|------|-------|
| `path` | `string` | Workspace-relative. |
| `kind` | `'added' \| 'changed' \| 'removed'` | Rename arrives as `removed` + `added`. |
| `isDirectory` | `boolean` | |

Rules:

- Events for application-originated writes are suppressed in main and never
  reach the renderer (FR-037, research.md R8).
- Debounced 100 ms per path.
- Events for non-markdown files are dropped, consistent with FR-010.

## Derived state (not stored)

| Value | Derivation |
|-------|------------|
| Window title | Active document title, plus `•` when dirty, plus workspace name |
| Tab dirty marker | `document.dirty` |
| Save enabled | `activeDocument !== null && (dirty \|\| path === null)` |
| Quit needs confirm | `documents.some(d => d.dirty)` |
| Live instance count | `documents.filter(d => d.editorState === 'live').length` |
