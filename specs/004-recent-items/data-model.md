# Data Model: Recent Items

**Feature**: `004-recent-items` | **Date**: 2026-08-03

## RecentItem (main process, persisted)

A persisted reference to a successfully opened markdown file or workspace folder.

| Field | Type | Notes |
|-------|------|-------|
| `path` | `string` | **Absolute** path of the file or folder. For files this is the dialog's chosen path (may be outside the current workspace); for folders the `realpathSync`-resolved workspace root. |
| `kind` | `'file' \| 'folder'` | Type discriminator (FR-006 dedupe key, FR-008 label). |
| `name` | `string` | `path.basename(path)` at record time — display name. |
| `lastOpenedAt` | `number` | Epoch ms of the most recent successful open. Ordering key (FR-006). |

Rules:

- Dedupe key is `(path, kind)`: reopening a file or folder moves the existing
  entry to the front of its group instead of adding a duplicate (FR-006).
- Per-type cap of 5 files and 5 folders (FR-012): a new qualifying entry evicts
  the least-recent entry of the *same* type when that type already has 5;
  entries of the other type are unaffected.
- Ordering is most-recent-first by `lastOpenedAt`; load normalizes/sorts even if
  a hand-edited config is unordered. The list is canonicalized folders-first —
  both `recordRecentItem` and load — so the menu's FR-015 grouping (folders
  above files) falls out of the stored order and the on-disk order is stable
  across record/load cycles; recency orders entries within each group.
- Only files opened through File > Open File (FR-002) and folders opened as a
  workspace (FR-003) become entries. Explorer-opened files never do (FR-013).

## Config file (`~/.config/ame/config.json` per FR-004)

```json
{
  "recentItems": [
    { "path": "/home/me/notes/idea.md", "kind": "file", "name": "idea.md", "lastOpenedAt": 1722000000000 }
  ]
}
```

- Location: `path.join(app.getPath('appData'), 'ame', 'config.json')` (research
  R1) — Linux `~/.config/ame/config.json`.
- Tolerated: missing file, unreadable file, invalid JSON, non-object root,
  missing `recentItems`, non-array `recentItems`, malformed entries → the invalid
  parts are skipped and the app starts with whatever valid entries remain
  (FR-011, spec edge cases). An unrecoverable parse returns `[]`.
- Writes are atomic: temp file in the same directory then rename (research R2 /
  Principle III), so a crash mid-write never corrupts the config.
- Written only when the list actually changes (record/remove), not on startup.

## MenuCommand (shared IPC contract) — extended

```ts
export type RecentKind = 'file' | 'folder'

export type MenuCommand =
  | 'open-file' | 'open-folder' | 'save' | 'save-as'
  | 'close-tab' | 'new-file'
  | { type: 'open-recent'; path: string; kind: RecentKind }
```

The object form is sent by the native Recent Items menu (main) to the renderer;
it names the exact recorded path and type to open.

## DesktopApi (preload) — new operations

| Method | Returns | Maps to channel |
|--------|---------|-----------------|
| `openRecentFile(path: string)` | `Promise<Result<OpenedFile>>` | `recent:openFile` |
| `prepareFolderOpen(path?: string)` | `Promise<Result<WorkspaceInfo \| null>>` | `workspace:prepareFolderOpen` |
| `commitFolderOpen()` | `Promise<Result<WorkspaceInfo>>` | `workspace:commitFolderOpen` |
| `cancelFolderOpen()` | `Promise<Result<null>>` | `workspace:cancelFolderOpen` |
| `onRecentItemsWarning(cb)` | `() => void` | `recentItems:warning` (event) |

Folder open is two-phase (research R5): `prepareFolderOpen` validates the target
and reads its entries without touching the live workspace (`null` when the
picker is cancelled); `commitFolderOpen` swaps the workspace and records the
folder; `cancelFolderOpen` abandons the prepared open. With a `path` argument
the folder must be a recorded recent entry, validated before disk access
(research R4); on an unavailable target the entry is removed, the menu rebuilt,
and a typed error returned (FR-009).

## Derived / state transitions

- **record (main)**: successful `file:openDialog` → `recordRecentItem({ path,
  kind: 'file', name })`; successful `workspace:commitFolderOpen` →
  `recordRecentItem({ path: resolvedRoot, kind: 'folder', name })`. Then rebuild
  the menu (research R3).
- **touch (main)**: successful `recent:openFile` / `commitFolderOpen` →
  `recordRecentItem(…)` again (moves entry to front, FR-006). Then rebuild.
- **remove (main)**: `recent:openFile` / `workspace:prepareFolderOpen(path)`
  failure (NOT_FOUND / NOT_TEXT / PERMISSION / wrong type) →
  `removeRecentItem(path, kind)`, rebuild menu, return the typed error. The
  renderer shows the error in-context and leaves its session unchanged.
- **renderer open of a recent file**: `openRecentFile` success →
  `OPEN_EXISTING` dispatch (identical to File > Open File).
- **renderer open of a recent folder**: the same prepare → (confirm) → commit
  flow as File > Open Folder, ending in `REPLACE`. When workspace-relative
  documents have unsaved changes a confirmation (Save All / Discard / Cancel)
  runs before `commitFolderOpen`; cancel calls `cancelFolderOpen` and leaves the
  session and the recent entry unchanged (FR-010, US3 scenario 3).
- **persistence failure (main)**: a config write failure is caught, reported via
  `recentItems:warning`, and never fails the open it follows (FR-011). The
  renderer shows the message as a quiet footer note.
- **clear (main, menu action)**: Clear Recent Items writes an empty list
  (best-effort; a persistence failure reports the quiet warning and is
  non-fatal), rebuilds the menu to the "No Recent Items" state, and never
  touches the open document/workspace session (FR-014).
