# Implementation Plan: Recent Items

**Branch**: `004-recent-items` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-recent-items/spec.md`

## Summary

Persist a per-user history of files and folders the user successfully opened
through the File menu (files) or opened as a workspace (folders), and present
it as a **Recent Items** submenu in the native File menu. Each entry opens
through the matching existing single-file / workspace-open path, survives
restarts, and is dropped the moment an open attempt proves the target
unavailable. The list is capped at 5 files and 5 folders (FR-012),
ordered most-recent-first within each group, with no duplicates per location
and type. Folder entries are grouped above file entries (FR-015); menu labels
are the shortened path with no `File:`/`Folder:` prefix — the grouping conveys
the type (2026-08-04 clarification).

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

**Performance Goals**: FR-012 per-type cap keeps the config file trivially small
(≤ 5 files + ≤ 5 folders). Menu rebuild and recency write happen only on a
successful open, a failed recent-open, or a Clear action — never on the
keystroke path (Principle IV).

**Constraints**: Renderer sandboxed (no Node); all disk I/O in main. The preload
API stays a fixed list of named operations — the new operations
(`openRecentFile`, `prepareFolderOpen`, `commitFolderOpen`, `cancelFolderOpen`,
`onRecentItemsWarning`) are validated in main against the stored recent-items
list before any disk access, so the renderer cannot ask main to open an
arbitrary path it did not already sanction (Principle II).

**Scale/Scope**: Single window, ≤ 5 recent files + ≤ 5 recent folders, one
config file. Pinning, sync, and startup auto-reopen are out of scope (spec
Assumptions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | All config I/O in main; the renderer only gains the named recent/file-folder IPC operations (openRecentFile, prepare/commit/cancelFolderOpen), a warning event, and an object-form menu command. No generic `invoke`, no `fs` in renderer | **PASS** |
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
  first, capped at 5 per type (FR-012).
- `saveRecentItems(filePath, items)` — atomic (temp file in the same directory,
  then rename; FR-011 + Principle III).
- `recordRecentItem(items, item)` — upsert by `(path, kind)`: remove any prior
  entry for the same location+type, prepend with fresh `lastOpenedAt`, evict the
  least-recent entry of the item's type when that type exceeds 5 (FR-012).
- `removeRecentItem(items, path, kind)` — drop the matching entry.
- Config shape: `{ "recentItems": [ ... ] }`.

**Config location** — `path.join(app.getPath('appData'), 'ame', 'config.json')`
(research R1). Computed lazily at each call. The e2e seam is the `AME_CONFIG_DIR`
environment variable (`src/main/recentItemsPath.ts`), which names the directory
that holds `config.json` directly and is set from the test launch env; it is a
test-only seam and production never sets it (recorded in research R1).

**Recording points (main handlers)** — the *only* places a recent entry is
added:

- `file:openDialog` success (File > Open File) → record the **absolute** file
  path (FR-002; FR-013: explorer opens use `file:read`, which never records).
- `workspace:commitFolderOpen` success (File > Open Folder and the toolbar
  button, which share this handler) → record the resolved workspace root
  (FR-003).

After any record/remove/clear the application menu is rebuilt so Recent Items
stays in sync (research R3).

**Menu (`src/main/menu.ts`)** — File submenu gains **Recent Items**:

- Empty → single disabled item "No Recent Items" (spec edge: "no selectable
  stale action").
- Non-empty → folder entries first, then a separator, then file entries, then a
  separator, then **Clear Recent Items**. Each entry is labelled
  `<shortenPath(path, 60)>` — the shortened path only, no type prefix (the
  folders-above-files grouping conveys the type; 2026-08-04 clarification —
  FR-008). recency orders entries within each group (FR-015). A group with no
  entries is omitted with its separator, and the folders/files separator appears
  only when both groups are non-empty (no dangling separator).
- Entry clicks send `{ type: 'open-recent', path, kind }` on `menu:command`
  (MenuCommand gains this object form).
- **Clear Recent Items** is a main-only action: it writes an empty list (best
  effort — a persistence failure reports the quiet footer warning and is
  non-fatal, FR-011/FR-014) and never touches the open document/workspace
  session.
- `refreshApplicationMenu()` is exported; it resolves the target window at call
  time (`BrowserWindow.getFocusedWindow() ?? getAllWindows()[0]`) so a macOS
  `activate` window recreate cannot leave the menu wired to a destroyed
  webContents, and re-invokes the menu build so handlers can rebuild after
  mutations.

**Opening a recent item** — named IPC operations, validated in main against
the stored list before disk access (research R4/R5):

- `recent:openFile` → `Result<OpenedFile>`: verify the path is a recorded recent
  file, realpath-resolve, confirm it still exists and is readable, read it,
  re-record (moves to front), return. On NOT_FOUND/NOT_TEXT/PERMISSION etc:
  remove the entry, rebuild the menu, return the typed error (FR-009). If the
  file is inside the current workspace, return the workspace-relative path and
  watch the parent (mirrors `file:openDialog`).
- Folder opens (both recent and File > Open Folder) are **two-phase**:
  `prepareFolderOpen(path?)` validates the target and reads its entries without
  touching the live workspace (`null` when the picker is cancelled; a recent
  `path` is re-validated against the stored list first), `commitFolderOpen()`
  swaps the workspace and records the folder, `cancelFolderOpen()` abandons the
  prepared open. On failure during prepare/commit: remove the entry, rebuild,
  return the typed error (FR-009) — the live workspace is untouched (research
  R5).

**Renderer (`src/renderer/App.tsx`)** — the `menu:command` handler learns to
recognise the object form: recent file → `window.api.openRecentFile(path)` then
`OPEN_EXISTING`; recent folder → the same prepare → (confirm) → commit flow as
File > Open Folder, ending in `REPLACE`. A failed result surfaces through the
existing in-context `operationError` dialog and the session is left untouched.
When workspace-relative documents have unsaved changes, the folder-open
confirmation (Save All / Discard / Cancel, FR-010 / US3 scenario 3) runs before
`commitFolderOpen`; cancel keeps the session and the recent entry unchanged. A
recent-items config write failure is reported as a quiet footer note via
`recentItems:warning` (FR-011, research R5).

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
├── recentItemsPath.ts           # NEW: lazy appData config path (AME_CONFIG_DIR test seam, R1)
├── recentItemsWarning.ts        # NEW: shared quiet footer-warning helper + recentItems:ok (FR-011)
├── scrubPaths.ts                # NEW: shared absolute-path scrubber for renderer-visible errors (Principle II)
├── fs/atomicWrite.ts            # EXTRACTED from handlers.ts: shared atomic write (wx + random + fsync + mode)
├── menu.ts                      # Recent Items submenu (grouped + Clear) + refreshApplicationMenu
└── ipc/handlers.ts              # record on dialog success; recent:openFile;
                                 #   prepare/commit/cancel folder open

src/preload/index.ts             # + openRecentFile / prepareFolderOpen / commitFolderOpen /
                                 #   cancelFolderOpen / onRecentItemsWarning / onRecentItemsOk
src/shared/
├── ipc-contract.ts              # RecentItem/RecentKind, MenuCommand object form, DesktopApi,
│                               #   RecentItemsWarning
└── shortenPath.ts               # MOVED from src/renderer/status/

src/renderer/
├── App.tsx                      # handle open-recent menu command + folder-open confirmation
└── status/StatusFooter.tsx      # import shortenPath from shared; quiet footer note

tests/
├── main/recentItems.test.ts     # NEW: store unit tests (temp-dir based)
├── renderer/shortenPath.test.ts # import path updated to shared
└── e2e/recent.spec.ts           # NEW: US1–US4 + edges, native-menu driven
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
- Phase 7: US4 (P2) + grouping — Clear Recent Items; per-type 5/5 cap; folders
  grouped above files (FR-012/014/015)

## Deferred / later features

- Pinning recent entries (spec Assumptions: out of scope).
- Cross-device sync or startup auto-reopen of the last session.
- Recording files opened solely from the explorer (FR-013 explicitly forbids).
- Menu icons for recent entries (native menu cross-platform icon assets add
  packaging complexity; the FR-015 grouping conveys the type).

## Complexity tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| Moving `shortenPath` from renderer to `src/shared/` (touches spec 003 code) | The main-process menu needs the same unambiguous long-path shortening as the footer; two copies would drift and each needs its own tests | Keeping a second copy in main (logic divergence, duplicated tests) or rendering full-width unshortened labels in native menus (violates the spec's long-path shortening edge) |
| New `openRecentFile` + `prepareFolderOpen`/`commitFolderOpen`/`cancelFolderOpen` IPC operations take an absolute path from the renderer | A recent file may sit outside the current workspace and must be openable without re-picking; the existing dialogs cannot express "open this specific path" | Reusing the picker (breaks "reopen from menu" entirely) or a generic `invoke(channel)` escape hatch (forbidden by Principle I) — the narrow ops are validated in main against the sanctioned recent list (R4) |
| Folder open is split into prepare/commit/cancel with a renderer-side unsaved-work confirmation | FR-010 / US3 scenario 3 require a confirmation whose cancel leaves the session and recent entry unchanged; a single `recent:openFolder → REPLACE` cannot express a renderer decision in the middle of main's workspace swap, and the base open-folder path had no confirmation at all (research R5) | A confirmation that only lives in main (main cannot know which open docs are dirty — that state is renderer/editor-owned), or committing the swap before confirming (violates FR-009/FR-010) |
| Quiet footer note + `recentItems:warning` event for config persistence failures | FR-011: a config write failure must not fail the open it follows, but "appears to have saved" silently would violate Principle III's spirit — the user should be able to notice and act | Raising the same modal `operationError` for a non-fatal background write (over-alarms for a best-effort path, spec's "quiet, actionable" wording) |
| `sanitizeError` runs the absolute-path scrub unconditionally, in addition to the current-root scrub | Principle II: with a workspace open only the current root was scrubbed, so a failure while preparing a dialog-chosen folder or committing a recent folder located elsewhere passed the raw absolute path into the renderer error (review-#2 security finding 1) | Scrub only when `workspaceRoot` is null (the pre-existing behaviour — leaks other absolute paths once a workspace is open) |
| `commitFolderOpen` re-validates the root, and its catch no longer removes the entry | FR-009: chokidar reports a missing root via an async error, not a throw, so a folder deleted in the prepare→commit window would silently commit to a dead workspace; and a watcher/environmental failure does NOT prove the folder invalid, so the spec's "removed only when proved unavailable" forbids dropping it there (review-#2 correctness 1/2) | Relying on `candidate.open` to throw (does not for a missing root) or treating every commit failure as invalidity (drops a still-valid recent folder) |
| Single in-flight guard on `prepareFolderOpen` (reject while one is pending) | The single-slot `pendingFolderOpen` races under overlapping flows: a second prepare would overwrite the slot and the first flow's commit would swap to the wrong folder (review-#2 correctness 3) | A per-flow token through prepare/commit/cancel (more moving parts across the IPC boundary than a rejection the renderer already surfaces in context) |
| `Discard` in the folder-open confirmation closes the dirty workspace-relative documents | "Discard" that only skips the save leaves the edits dirty with rebindable relative paths — a later Ctrl+S writes old-root content over whatever file shares the path in the new folder (a cross-folder overwrite hazard; review-#2 correctness 4) | Leaving the tabs open but clean (falsely reports the discarded edits as saved) or leaving them dirty (the overwrite hazard) |
| `recordRecentItem` canonicalizes folders-first, matching `normalizeRecentItems` | The persisted array otherwise flip-flops between `[new, …others, …sameKind]` (after a record) and folders-first (after any load) on every record/load cycle (review-#2 correctness 5) | Leaving the on-disk order to alternate (cosmetic churn plus an uncapped `others` tail for non-normalized input) |
| `recentItems:ok` event clears the footer warning | A persistence-warning note must not linger for the whole session after the cause resolves (review-#2 perf 3 / correctness 7) | A timeout/dismissal in the renderer (clears the note while the problem may still exist; the ok event clears it exactly when persistence recovers) |
| Windows-only case folding in the dedupe key | `C:\Notes` vs `c:\notes` must dedupe on Windows (FR-006); on macOS/Linux `realpath` canonicalization already handles case-variant live targets | Folding case on all platforms (would wrongly merge two genuinely distinct case-sensitive files on Linux) |

## Decision log (2026-08-04, review #2)

- Menu labels dropped the `File:`/`Folder:` prefix (user request, spec
  Clarification). The FR-015 grouping and the entry name convey the type.
- `src/main/scrubPaths.ts` extracted so `sanitizeError` and
  `recentItemsWarning` share one scrub pattern (UNC + spaces now covered).
- `src/main/fs/atomicWrite.ts` extracted from `handlers.ts` (wx + randomBytes +
  fsync + `0o600`), shared by `file:saveDialog` and `saveRecentItems`.
- `AME_CONFIG_DIR` is the e2e test seam (recorded in research R1); lazy
  `app.getPath('appData')` resolution retained.
- Folder-open confirmation wording reworded to state the workspace is
  replaced rather than claiming a document rebind that does not happen.
