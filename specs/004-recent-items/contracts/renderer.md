# Renderer Contract: Recent Items

**Feature**: `004-recent-items` | **Date**: 2026-08-03

## IPC surface (new operations)

| Channel | Request | Response | Notes |
|---------|---------|----------|-------|
| `recent:openFile` | `{ path: string }` | `Result<OpenedFile>` | Opens a recorded recent file by absolute path. Validated in main against the stored recent-items list; on an unavailable target the entry is removed, the menu rebuilt, and a typed error returned. Inside the workspace the response carries the relative path. |
| `recent:openFolder` | `{ path: string }` | `Result<WorkspaceInfo>` | Opens a recorded recent folder as a workspace (mirrors `workspace:openDialog`). Same validation/removal semantics. |

Errors reuse the existing `ErrorCode` set: `NOT_FOUND`, `NOT_TEXT`,
`PERMISSION`, `OUTSIDE_WORKSPACE` (path not in the sanctioned recent list),
`IO`.

## Preload API

```ts
openRecentFile(path: string): Promise<Result<OpenedFile>>
openRecentFolder(path: string): Promise<Result<WorkspaceInfo>>
```

Added to `DesktopApi`; exposed via `contextBridge` as named operations (no
generic `invoke`).

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
- `kind: 'folder'` → `window.api.openRecentFolder(path)` → on `ok` dispatch
  `REPLACE` (identical to File > Open Folder); on error surface in-context and
  leave the session unchanged.

## Recent-items config (main-owned, renderer never reads it)

Location: `~/.config/ame/config.json` (Linux) / `appData/ame/config.json`
generally. Shape `{ "recentItems": RecentItem[] }`. The renderer neither reads
nor writes this file — it only learns of entries through menu commands.

## Label contract (native menu)

- Empty list → one disabled item **No Recent Items** (no selectable stale
  action).
- File entry → `File: <shortenPath(path, 60)>`.
- Folder entry → `Folder: <shortenPath(path, 60)>`.
- `shortenPath` lives in `src/shared/` (moved from renderer/status) and keeps
  the final path segment whole with a `…` prefix when too long, so entries stay
  unambiguous and selectable for long/non-Latin paths.

## Error and edge behaviour

- **Missing/unreadable target** (file or folder): entry removed from the list
  and menu immediately; the failed open returns a typed error which the renderer
  shows via its existing `operationError` dialog. The current document/workspace
  session is untouched.
- **Path never recorded**: `openRecentFile`/`openRecentFolder` reject with
  `OUTSIDE_WORKSPACE` (renderer cannot open arbitrary paths — Principle II).
- **Malformed/missing config**: app starts with an empty list; no renderer
  impact beyond an empty (disabled) Recent Items menu.
- **Explorer-opened file**: never recorded (FR-013) — recording lives only in
  the `file:openDialog` and `workspace:openDialog` handlers.
- **Long path**: shortened by `shortenPath`; unambiguous because the final
  segment is always kept whole.

## Tests that must exist

- `tests/main/recentItems.test.ts` — load tolerance (missing/invalid/malformed
  config, garbage entries), ordering by `lastOpenedAt`, dedupe by `(path, kind)`,
  cap of 10 with least-recent eviction, remove, atomic save (temp+rename).
- `tests/renderer/shortenPath.test.ts` — existing suite, import path updated to
  `src/shared/shortenPath`.
- `tests/main/ipc.test.ts` — shape test for the `open-recent` MenuCommand object
  and the new `DesktopApi` operation types.
- `tests/e2e/recent.spec.ts` — US1 record/reopen/restart-persistence; US2 type
  distinction and matching open behaviour; US3 unavailable-entry removal with
  session preserved; FR-013 explorer non-recording; empty-menu state; cap; long
  path label.
