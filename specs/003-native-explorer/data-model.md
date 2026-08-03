# Phase 1 Data Model: Native Explorer

**Feature**: `003-native-explorer` | **Date**: 2026-08-03

This feature changes the shape of the workspace dialog result and the renderer
workspace state's *population* (not its schema). The Document model is
untouched. This document records the delta.

## WorkspaceInfo (shared IPC contract) — extended

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | unchanged (basename of the opened folder) |
| `path` | `string \| null` | **new.** The realpath of the opened workspace root, returned by `workspace:openDialog` for display only. Never used by any renderer fs call. |
| `entries` | `DirEntry[]` | unchanged |

## WorkspaceState (renderer) — schema unchanged, `root` now populated

`WorkspaceState.root: string | null` already existed but every `REPLACE`
dispatch set it to `null`. The two `REPLACE` dispatches in `App.tsx` (menu
"Open Folder" and the toolbar handler) now pass `root: result.value.path`, so
the footer can read the full location.

| Field | Type | Notes |
|-------|------|-------|
| `root` | `string \| null` | now the absolute workspace path (was always `null`) |

## Derived state (footer)

| Value | Derivation |
|-------|-----------|
| Footer left text | `activeDoc ? activeDoc.title + (dirty ? ' •' : '') : 'No document open'` |
| Footer right full text | `workspace.root` (or `'No folder open'` when `workspace.name === null`) |
| Footer right displayed text | `workspace.root === null ? placeholder : (fits ? root : shortenPath(root, maxChars))` |
| `maxChars` | `max(finalFolderName.length + 3, floor(footerWorkspaceWidthPx / 8))` |

## Reducer changes

None. The documents reducer, workspace reducer actions, and action payloads are
unchanged — `REPLACE` already accepted and stored `root`. The only code change
is *passing* the real path instead of `null`.
