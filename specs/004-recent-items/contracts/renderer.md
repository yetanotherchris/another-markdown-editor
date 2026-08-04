# Renderer Contract: Recent Items

**Feature**: `004-recent-items` | **Date**: 2026-08-03

## IPC surface (new operations)

| Channel | Request | Response | Notes |
|---------|---------|----------|-------|
| `recent:openFile` | `{ path: string }` | `Result<OpenedFile>` | Opens a recorded recent file by absolute path. Validated in main against the stored recent-items list; on an unavailable target the entry is removed, the menu rebuilt, and a typed error returned. Inside the workspace the response carries the relative path. |
| `workspace:prepareFolderOpen` | `{ path: string } \| undefined` | `Result<WorkspaceInfo \| null>` | Phase 1 of folder open. With `path`, opens only a recorded recent folder (same sanctioned-list validation; `OUTSIDE_WORKSPACE` otherwise). With no `path`, shows the OS picker. Validates the target and reads its entries WITHOUT touching the live workspace; returns `null` when the picker is cancelled. |
| `workspace:commitFolderOpen` | — | `Result<WorkspaceInfo>` | Phase 2. Swaps the workspace and records the folder in Recent Items. The only point the live workspace changes. |
| `workspace:cancelFolderOpen` | — | `Result<null>` | Abandons a prepared folder open; session and recent list unchanged. |
| `recentItems:warning` | (event) | `{ message: string }` | Quiet, non-fatal persistence warning (FR-011). Main → renderer, pushed when a config write fails. |
| `recentItems:ok` | (event) | (none) | Pushed after a successful config write so the renderer can clear a previous warning note. |

Errors reuse the existing `ErrorCode` set: `NOT_FOUND`, `NOT_TEXT`,
`PERMISSION`, `OUTSIDE_WORKSPACE` (path not in the sanctioned recent list),
`NO_WORKSPACE` (commit with nothing prepared), `IO`.

## Preload API

```ts
openRecentFile(path: string): Promise<Result<OpenedFile>>
prepareFolderOpen(path?: string): Promise<Result<WorkspaceInfo | null>>
commitFolderOpen(): Promise<Result<WorkspaceInfo>>
cancelFolderOpen(): Promise<Result<null>>
onRecentItemsWarning(cb: (w: { message: string }) => void): () => void
onRecentItemsOk(cb: () => void): () => void
```

Added to `DesktopApi`; exposed via `contextBridge` as named operations (no
generic `invoke`). `prepareFolderOpen` rejects with `IO` ("A folder open is
already in progress") while another folder open is pending, so overlapping
flows cannot clobber the pending slot.

## MenuCommand (extended)

```ts
type MenuCommand =
  | 'open-file' | 'open-folder' | 'save' | 'save-as'
  | 'close-tab' | 'new-file'
  | { type: 'open-recent'; path: string; kind: 'file' | 'folder' }
```

The native **Recent Items** submenu (built in main from the persisted list)
sends the object form on `menu:command`. The renderer routes it:

- `kind: 'file'` → `window.api.openRecentFile(path)` → on `ok` dispatch
  `OPEN_EXISTING` (identical to File > Open File); on error surface in-context
  and leave the session unchanged.
- `kind: 'folder'` → the same prepare → (confirm) → commit flow as
  File > Open Folder, ending in `REPLACE` (FR-007). When workspace-relative
  documents have unsaved changes, a confirmation dialog (Save All / Discard /
  Cancel) runs before `commitFolderOpen`; cancel keeps the session and the
  recent entry unchanged (FR-010, US3 scenario 3).

## Recent-items config (main-owned, renderer never reads it)

Location: `~/.config/ame/config.json` (Linux) / `appData/ame/config.json`
generally. Shape `{ "recentItems": RecentItem[] }`. The renderer neither reads
nor writes this file — it only learns of entries through menu commands.

## Label contract (native menu)

- Empty list → one disabled item **No Recent Items** (no selectable stale
  action), and no Clear action.
- Non-empty → folders first, then a separator, then files, then a separator,
  then **Clear Recent Items** (a main-only action; FR-014/FR-015). A group with
  no entries is omitted with its separator, and the folders/files separator
  appears only when both groups are non-empty (no dangling separator).
- File entry → `<shortenPath(path, 60)>`; folder entry → `<shortenPath(path, 60)>`.
  Labels carry no `File:`/`Folder:` prefix (2026-08-04 clarification) — the
  FR-015 grouping and the entry name (directory name vs `.md` filename) convey
  the type.
- `shortenPath` lives in `src/shared/` (moved from renderer/status) and keeps
  the final path segment whole with a `…` prefix when too long, so entries stay
  unambiguous and selectable for long/non-Latin paths.
- The **Clear Recent Items** click runs entirely in main (writes an empty list,
  best-effort with a quiet footer warning on failure) and never involves the
  renderer or the open document/workspace session.

## Error and edge behaviour

- **Missing/unreadable target** (file or folder): entry removed from the list
  and menu immediately; the failed open returns a typed error which the renderer
  shows via its existing `operationError` dialog. The current document/workspace
  session is untouched (folder open fails in `prepareFolderOpen`, before any
  swap).
- **Path never recorded**: `openRecentFile` / `prepareFolderOpen(path)` reject
  with `OUTSIDE_WORKSPACE` (renderer cannot open arbitrary paths — Principle II).
- **Cancelled unsaved-work confirmation** (folder open, US3 scenario 3):
  `cancelFolderOpen()` runs in main; session and recent entry unchanged. A failed
  save during "Save All" keeps the confirmation open. The confirmation applies
  to **workspace-relative** documents with unsaved changes only (2026-08-04
  clarification). **Discard** closes those documents (their edits are thrown
  away) and then commits — it does not leave them open, which would risk a
  cross-folder overwrite once their relative paths rebind to the new root.
- **Overlapping folder opens**: `prepareFolderOpen` rejects with `IO` while a
  pending folder open exists, so a second open cannot clobber the in-flight
  flow. A folder deleted in the prepare→commit window fails at
  `commitFolderOpen` (root re-validated there), which leaves the session
  unchanged and drops the now-unavailable entry.
- **Malformed/missing config**: app starts with an empty list; no renderer
  impact beyond an empty (disabled) Recent Items menu. A config write failure is
  non-fatal and pushes a `recentItems:warning` event, which the renderer shows as
  a quiet footer note; a later successful write pushes `recentItems:ok`, which
  clears the note.
- **Explorer-opened file**: never recorded (FR-013) — recording lives only in
  the `file:openDialog` and `commitFolderOpen` paths.
- **Long path**: shortened by `shortenPath`; unambiguous because the final
  segment is always kept whole.
- **Error messages**: main scrubs absolute paths (drive-letter, UNC, POSIX)
  from every renderer-visible error regardless of whether a workspace is open
  (Principle II).

## Tests that must exist

- `tests/main/recentItems.test.ts` — load tolerance (missing/invalid/malformed
  config, garbage entries), ordering by `lastOpenedAt`, dedupe by `(path, kind)`,
  per-type cap of 5 with least-recent eviction per type, remove, clear, atomic
  save (temp+rename).
- `tests/renderer/shortenPath.test.ts` — existing suite, import path updated to
  `src/shared/shortenPath`.
- `tests/main/ipc.test.ts` — shape test for the `open-recent` MenuCommand object
  and the new `DesktopApi` operation types.
- `tests/e2e/recent.spec.ts` — US1 record/reopen/restart-persistence; US2 type
  distinction and matching open behaviour; US3 unavailable-entry removal with
  session preserved **and** the cancelled unsaved-work confirmation (folder open)
  preserving session + recent entry; US4 Clear Recent Items; FR-013 explorer
  non-recording; empty-menu state; per-type 5/5 cap; folders-before-files
  grouping; long path label.
