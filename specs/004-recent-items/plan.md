# Implementation Plan: Recent Items

**Branch**: `004-recent-items` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-recent-items/spec.md`

## Summary

Persist a per-user history of files and folders the user successfully opened
through the File menu (files) or opened as a workspace (folders), and present
it as a **Recent Items** submenu in the native File menu. Each entry shows
whether it is a file or a folder, opens through the matching existing
single-file / workspace-open path, survives restarts, and is dropped the moment
an open attempt proves the target unavailable. The list is capped at the 10 most
recently used entries, ordered most-recent-first with no duplicates per location
and type.

This is a **main-process + native-menu** feature (the renderer owns document and
workspace state and receives a small menu-command extension plus two new IPC
operations to open a recorded path). Persistence lives in a new main-process
module reading/writing the per-user JSON config file required by FR-004
(`~/.config/ame/config.json` on `~/.config` platforms).

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: No new runtime dependencies. Existing: Electron 43,
React 19, `@milkdown/crepe` 7.21.3. The only structural move is `shortenPath`
from `src/renderer/status/` to `src/shared/` so the main-process menu labels and
the renderer footer share one implementation (research R2).

**Storage**: a new per-user JSON config file
`path.join(app.getPath('appData'), 'ame', 'config.json')` — on Linux
`~/.config/ame/config.json` (FR-004), on macOS
`~/Library/Application Support/ame/config.json`, on Windows `%APPDATA%\ame\config.json`.
Existing `settings.json` (`userData`) is untouched.

**Testing**: Vitest 4 (node project for `tests/main`); Playwright via
`npm run test:e2e` (build + launch, headless). Native menu items are driven in
e2e with `electronApp.evaluate` (`Menu.getApplicationMenu()` → `item.click()`).

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), three build targets.

**Performance Goals**: FR-012 cap keeps the config file trivially small
(≤ 10 entries). Menu rebuild and recency write happen only on a successful open
or a failed recent-open, never on the keystroke path (Principle IV).

**Constraints**: Renderer sandboxed (no Node); all disk I/O in main. The preload
API stays a fixed list of named operations — the two new operations
(`openRecentFile`, `openRecentFolder`) are validated in main against the stored
recent-items list before any disk access, so the renderer cannot ask main to
open an arbitrary path it did not already sanction (Principle II).

**Scale/Scope**: Single window, ≤ 10 recent entries, one config file. Clearing,
pinning, sync, and startup auto-reopen are out of scope (spec Assumptions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | All config I/O in main; the renderer only gains two named IPC operations plus an object-form menu command. No generic `invoke`, no `fs` in renderer | **PASS** |
| II. Every Path Is Untrusted | Recent-item open handlers resolve the target realpath in main and verify it is *already in the stored recent-items list* before touching disk. A renderer-supplied path that main never recorded is rejected. Missing/unreadable targets fail closed with a typed error and are removed from the list | **PASS** |
| III. Never Lose The User's Words | Recording happens only after a dialog open already succeeded; nothing on the save/close/quit path changes. The config file is written atomically (temp + rename) so a crash cannot corrupt it | **PASS** |
| IV. Calm, Predictable Editing | No work on the keystroke path; recency writes and menu rebuilds are user-action-driven and small | **PASS** |
| V. Test What Can Corrupt Or Escape | `tests/main/recentItems.test.ts` (normalize/order/dedupe/cap/persistence tolerance, atomic write), IPC shape tests, full e2e suite at `tests/e2e/recent.spec.ts` covering record, reopen, type distinction, restart persistence, unavailable-entry removal, explorer non-recording | **PASS** |

## Phase 1 Design decisions

**Persistence module (`src/main/recentItems.ts`)** — a pure, electron-free store
(testable under vitest node without mocking Electron):

- `RecentItem = { path, kind: 'file'|'folder', name, lastOpenedAt }` where
  `path` is the absolute path, `name` its basename (display), `kind` the type.
- `loadRecentItems(filePath)` — tolerant: missing/unreadable/malformed config →
  `[]`; non-array or garbage entries are skipped; entries with a non-absolute
  path, bad `kind`, or non-number `lastOpenedAt` are dropped. Sorted most-recent
  first, capped at 10.
- `saveRecentItems(filePath, items)` — atomic (temp file in the same directory,
  then rename; FR-011 + Principle III).
- `recordRecentItem(items, item)` — upsert by `(path, kind)`: remove any prior
  entry for the same location+type, prepend with fresh `lastOpenedAt`, cap 10.
- `removeRecentItem(items, path, kind)` — drop the matching entry.
- Config shape: `{ "recentItems": [ ... ] }`.

**Config location** — `path.join(app.getPath('appData'), 'ame', 'config.json')`
(research R1). Computed lazily at each call so tests can relocate it with
`app.setPath('appData', …)` before the first record.

**Recording points (main handlers)** — the *only* places a recent entry is
added:

- `file:openDialog` success (File > Open File) → record the **absolute** file
  path (FR-002; FR-013: explorer opens use `file:read`, which never records).
- `workspace:openDialog` success (File > Open Folder and the toolbar button,
  which share this handler) → record the resolved workspace root (FR-003).

After any record/remove the application menu is rebuilt so Recent Items stays in
sync (research R3).

**Menu (`src/main/menu.ts`)** — File submenu gains **Recent Items**:

- Empty → single disabled item "No Recent Items" (spec edge: "no selectable
  stale action").
- Non-empty → one enabled item per entry, label
  `File: <shortenPath(path, 60)>` / `Folder: <shortenPath(path, 60)>`
  (FR-008 type distinction + long-path shortening edge; research R2).
- Clicking sends `{ type: 'open-recent', path, kind }` on `menu:command`
  (MenuCommand gains this object form).
- `refreshApplicationMenu(window)` is exported and re-invokes the menu build so
  handlers can rebuild after mutations.

**Opening a recent item** — new IPC operations, both validated in main against
the stored list before disk access (research R4):

- `recent:openFile` → `Result<OpenedFile>`: verify the path is a recorded recent
  file, realpath-resolve, confirm it still exists and is readable, read it,
  re-record (moves to front), return. On NOT_FOUND/NOT_TEXT/PERMISSION etc:
  remove the entry, rebuild the menu, return the typed error (FR-009). If the
  file is inside the current workspace, return the workspace-relative path and
  watch the parent (mirrors `file:openDialog`).
- `recent:openFolder` → `Result<WorkspaceInfo>`: same pattern, but opens the
  folder as a workspace (mirrors `workspace:openDialog`). On failure: remove,
  rebuild, return the error (FR-009).
- The renderer routes these through the **exact same dispatch paths** as
  File > Open File / Open Folder (`OPEN_EXISTING` / `REPLACE`), so FR-007 and
  FR-010 hold by construction.

**Renderer (`src/renderer/App.tsx`)** — the `menu:command` handler learns to
recognise the object form: recent file → `window.api.openRecentFile(path)` then
`OPEN_EXISTING`; recent folder → `window.api.openRecentFolder(path)` then
`REPLACE`. A failed result surfaces through the existing in-context
`operationError` dialog and the session is left untouched.

**Shared `shortenPath`** — moved verbatim from
`src/renderer/status/shortenPath.ts` to `src/shared/shortenPath.ts`; the footer
and its unit test import the shared module (research R2).

## Project Structure

### Documentation (this feature)

```text
specs/004-recent-items/
├── spec.md              # Requirements
├── plan.md              # This file
├── research.md          # R1…R4 decisions
├── data-model.md        # RecentItem, config shape, menu command, IPC ops
├── quickstart.md        # Manual verification script
├── contracts/
│   └── renderer.md      # IPC + preload + menu-command contract
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/main/
├── recentItems.ts               # NEW: pure store + atomic file I/O (electron-free)
├── menu.ts                      # Recent Items submenu + refreshApplicationMenu
└── ipc/handlers.ts              # record on dialog success; recent:openFile/openFolder

src/preload/index.ts             # + openRecentFile / openRecentFolder
src/shared/
├── ipc-contract.ts              # RecentItem/RecentKind, MenuCommand object form, DesktopApi
└── shortenPath.ts               # MOVED from src/renderer/status/

src/renderer/
├── App.tsx                      # handle open-recent menu command
└── status/StatusFooter.tsx      # import shortenPath from shared

tests/
├── main/recentItems.test.ts     # NEW: store unit tests (temp-dir based)
├── renderer/shortenPath.test.ts # import path updated to shared
└── e2e/recent.spec.ts           # NEW: US1–US3 + edges, native-menu driven
```

**Structure decision**: recency persistence is a main-process concern (FR-004
config file), the menu is native, and the renderer gains only a narrow,
validated open-by-path capability. This keeps the process boundary auditable:
all disk and path logic stays in `src/main/`, and `src/shared/shortenPath.ts` is
the only cross-process addition.

## Phase status

- Phase 1: Setup (green baseline; `shortenPath` move to shared)
- Phase 2: Foundational (RecentItem types + menu-command contract + IPC contract)
- Phase 3: US1 (P1) — record on successful File-menu/workspace open; Recent Items
  menu; reopen; restart persistence
- Phase 4: US2 (P2) — type-distinct labels and matching open behaviour
- Phase 5: US3 (P2) — unavailable-entry removal + failure surfaces in context
- Phase 6: e2e suite + final gates

## Deferred / later features

- Clearing or pinning recent entries (spec Assumptions: out of scope).
- Cross-device sync or startup auto-reopen of the last session.
- Recording files opened solely from the explorer (FR-013 explicitly forbids).
- Menu icons for recent entries (native menu cross-platform icon assets add
  packaging complexity; the text `File:`/`Folder:` tag satisfies FR-008).

## Complexity tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| Moving `shortenPath` from renderer to `src/shared/` (touches spec 003 code) | The main-process menu needs the same unambiguous long-path shortening as the footer; two copies would drift and each needs its own tests | Keeping a second copy in main (logic divergence, duplicated tests) or rendering full-width unshortened labels in native menus (violates the spec's long-path shortening edge) |
| New `openRecentFile`/`openRecentFolder` IPC operations take an absolute path from the renderer | A recent file may sit outside the current workspace and must be openable without re-picking; the existing dialogs cannot express "open this specific path" | Reusing the picker (breaks "reopen from menu" entirely) or a generic `invoke(channel)` escape hatch (forbidden by Principle I) — the narrow ops are validated in main against the sanctioned recent list (R4) |
