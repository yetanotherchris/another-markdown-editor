# Research & Technical Decisions: Recent Items

**Feature**: `004-recent-items` | **Date**: 2026-08-03

Every decision below was verified against the installed packages and this
repository (electron 43, react 19, crepe 7.21.3, vitest 4, playwright 1.62).

## R1 — Config location: `appData/ame/config.json`

**Finding**: FR-004 requires `~/.config/ame/config.json` on platforms using the
conventional `~/.config` directory, and the platform's conventional per-user
config location elsewhere.

**Decision**: `path.join(app.getPath('appData'), 'ame', 'config.json')`, resolved
lazily at each call.

Electron's `appData` resolves to exactly the required conventional directory:

| Platform | `app.getPath('appData')` | Result |
|----------|--------------------------|--------|
| Linux    | `$XDG_CONFIG_HOME` or `~/.config` | `~/.config/ame/config.json` ✓ (FR-004) |
| macOS    | `~/Library/Application Support` | `~/Library/Application Support/ame/config.json` |
| Windows  | `%APPDATA%` (Roaming) | `%APPDATA%\ame\config.json` |

**Why not `userData`**: `app.getPath('userData')` appends the product/app name
(e.g. `~/.config/another-markdown-editor`), which does not match the spec's
explicit `ame` path. The existing `settings.json` continues to use `userData` —
this feature's config file is a separate, spec-mandated location.

**Lazy resolution**: `recentItemsPath()` recomputes `app.getPath('appData')`
every call (never cached at module load). The e2e test seam is the
**`AME_CONFIG_DIR`** environment variable: when set, it names the directory that
holds `config.json` directly (`recentItemsPath.ts:22-27`). The suite launches
the app with `AME_CONFIG_DIR` pointing at a per-test temp dir
(`tests/e2e/recent.spec.ts`), which isolates tests from the developer's real
config BEFORE the startup menu is built. Production never sets it, so the
default path above is unchanged. (An earlier draft of this note claimed the
suite relocates via `app.setPath('appData', …)`; the implemented seam is the
env var, recorded here per AGENTS.md.)

**Alternatives rejected**: `userData` (wrong path per FR-004); a hardcoded
`~/.config` string (breaks macOS/Windows, ignores XDG_CONFIG_HOME).

## R2 — `shortenPath` moves to `src/shared/`

**Finding**: menu labels need the same "unambiguous shortened path that keeps the
final name whole" behaviour the footer already implements (spec edge: long paths
must remain unambiguous and selectable). Native menus render the label as a flat
string; there is no CSS ellipsis in an Electron `MenuItem`.

**Decision**: move `src/renderer/status/shortenPath.ts` verbatim to
`src/shared/shortenPath.ts`. `StatusFooter.tsx` and `tests/renderer/shortenPath.test.ts`
import the shared module. Both `tsconfig.main.json` and `tsconfig.renderer.json`
already include `src/shared/**/*.ts`, so no config change is needed.

The function is pure (no Node/Electron/DOM imports), so main can import it
freely and the existing unit tests keep their coverage unchanged.

**Alternatives rejected**: duplicate a shortening helper in main (logic drift,
two test surfaces); render full-length labels (native menus would blow out to
thousands of pixels for deep paths, violating the shortening edge case).

## R3 — Menu rebuild after mutation

**Finding**: `menu.ts` builds the menu once in `createWindow`. Recent Items must
refresh when an entry is recorded (on successful open) or removed (on failed
open). Electron requires `Menu.setApplicationMenu` again to swap the live menu.

**Decision**: `createApplicationMenu(window)` reads the current recent list each
time it runs. `refreshApplicationMenu()` is exported; it resolves the target
window at call time (`BrowserWindow.getFocusedWindow() ?? getAllWindows()[0]`,
guarding a destroyed webContents) and re-invokes the menu build — a macOS
`activate` window recreate cannot leave the menu wired to a destroyed window.
Main handlers call it after any `recordRecentItem` / `removeRecentItem` /
clear. Rebuilding is cheap (≤ 10 menu entries) and only happens on user-driven
open events, never on a keystroke path.

**Costs**: rebuilding the app menu discards any transient menu state — there is
none we depend on (no open menus are rebuilt mid-display in a realistic flow).

## R4 — Recent-open IPC must re-validate the path in main

**Finding**: a recent file may live outside the current workspace, so it cannot
be opened through the existing workspace-relative `file:read`. We must add a
way to open an absolute path. Principle I forbids a generic escape hatch;
Principle II says every path is untrusted.

**Decision**: named operations, all validated against main's own stored
recent-items list *before* any filesystem access:

- `recent:openFile(path)` → `Result<OpenedFile>`
- `workspace:prepareFolderOpen(path)` → `Result<WorkspaceInfo | null>` — the
  recent-folder open shares the two-phase folder flow with File > Open Folder
  (see R5); when given a `path` it re-validates against the stored list exactly
  as `recent:openFolder` would have.

Each handler:

1. `loadRecentItems()`; confirm an entry with `(path, kind)` exists. If not →
   `err('OUTSIDE_WORKSPACE', …)` (the renderer is asking main to open something
   main never sanctioned).
2. `fs.realpathSync(path)` and confirm the target still exists and has the right
   type. On failure (ENOENT → `NOT_FOUND`, EACCES → `PERMISSION`, wrong type →
   `NOT_TEXT`/`NOT_FOUND`) remove the entry from the list, rebuild the menu, and
   return the typed error (FR-009).
3. Open it exactly like the dialog handlers:
   - File: read bytes; if the realpath is inside the current workspace return
     the workspace-relative path and `watchDir` the parent; otherwise return
     `path: null` with the absolute content (mirrors `file:openDialog`).
   - Folder: prepare the target and read its entries WITHOUT touching the live
     workspace; the swap to a fresh `WorkspaceState` happens only on
     `commitFolderOpen` (R5).
4. `recordRecentItem(…)` to bump the entry to the front (FR-006), rebuild menu.

**Why this preserves the boundary**: the renderer cannot read arbitrary paths —
it can only request paths that main itself recorded earlier (from real,
successful user opens). A compromised renderer gets nothing new: it could not
have caused main to record a path main did not open. The existing dialog
handlers (`file:openDialog`) remain the only way new paths enter the list.

## R5 — Two-phase folder open + quiet persistence warning

**Finding**: FR-009 requires a failed folder open to leave the current workspace
and document session unchanged, and FR-010 / US3 scenario 3 require an
unsaved-work confirmation whose *cancel* also leaves the session and the recent
entry unchanged. A single `recent:openFolder → REPLACE` hop cannot express a
renderer-side confirmation in the middle of main's swap, and the base
"open folder → REPLACE" path had no confirmation at all.

**Decision**: split folder open into three named operations, and give the
renderer a confirmation dialog:

- `prepareFolderOpen(path?)` — with `path` undefined shows the OS picker; with
  `path` opens only a recorded recent folder (R4 re-validation). Reads the
  entries without touching the live workspace. Returns `null` when the picker is
  cancelled.
- `commitFolderOpen()` — swaps `WorkspaceState` and records the folder (FR-003).
  The only point the live workspace changes.
- `cancelFolderOpen()` — abandons the prepared open; session and recent list
  unchanged (FR-010).

Both File > Open Folder and recent-folder opens route through the same
prepare → (confirm) → commit flow in the renderer (FR-007). When
workspace-relative documents have unsaved changes, the renderer shows a
confirmation (Save All / Discard / Cancel); a cancelled or failed save keeps the
prepared open uncommitted and the recent entry untouched.

**Persistence is best-effort (FR-011)**: a config write failure must never fail
the open it follows or delete a still-valid entry. `recordRecent` /
`removeRecent` catch save errors and send a `recentItems:warning` event;
the renderer shows it as a quiet footer note (non-modal, no session impact). A
subsequent successful write sends `recentItems:ok`, clearing the note.

## R6 — Review-#2 hardening (2026-08-04)

Verified against the installed packages (electron 43, chokidar, node fs).

**Commit re-validation (FR-009)**: chokidar reports a missing/unwatchable root
via an async `error` event, not a synchronous throw — `candidate.open` therefore
cannot detect a folder deleted in the prepare→commit window. `commitFolderOpen`
re-`realpathSync`s + `statSync`s the pending root before opening; a
re-validation failure proves the target unavailable and drops the entry. A
failure later in commit (watcher start, `EMFILE`/`EPERM`) does NOT prove the
folder invalid, so that catch no longer calls `removeRecent` — the spec removes
an entry only when an open attempt proves it unavailable or invalid.

**Single-slot `pendingFolderOpen`**: overlapping folder-opens (toolbar +
native menu + a double-clicked recent folder all stay live while the confirm
dialog is up) would overwrite the single main-process slot, so the first flow's
commit could swap to the second flow's folder. `prepareFolderOpen` now rejects
while a pending open exists; the renderer also ignores a new flow while its own
`pendingFolderOpen` state is set.

**Path scrubbing (Principle II)**: `sanitizeError` scrubs absolute paths
unconditionally — with a workspace open, the old code scrubbed only the current
root, so a failure preparing a dialog-chosen folder elsewhere leaked its raw
absolute path. The shared pattern (`src/main/scrubPaths.ts`) also covers UNC
paths and spaces inside path components.

**Discard semantics (FR-010)**: "Discard" in the folder-open confirmation now
closes the dirty workspace-relative documents. Leaving them open dirty would
let a later Ctrl+S write old-root content over whatever file shares the
relative path in the new folder (a cross-folder overwrite hazard); "discard"
only skipping the save did not actually discard anything.

**Canonical record order (FR-012)**: `recordRecentItem` emits folders-first,
matching `normalizeRecentItems`, so the on-disk order does not alternate between
`[new, …others, …sameKind]` (after a record) and folders-first (after any load)
on every record/load cycle.

**Windows case-fold dedupe (FR-006)**: the `dedupeKey` case fold is win32-only.
On macOS/Linux `canonicalPath` (realpath) already dedupes case-variant spellings
of live targets; the fold only matters for recorded-but-missing paths on
case-insensitive mounts.

## Decisions validated against the constitution

| Principle | Check |
|-----------|-------|
| I. Process isolation | Config I/O and path logic all in main; renderer gains the named recent/file-folder IPC ops (prepare/commit/cancel, openRecentFile) + an object menu command + a warning event, all typed in `ipc-contract.ts` |
| II. Path safety | Recent-open re-validates against the sanctioned list and realpath-resolves in main; failures close typed; renderer never picks an arbitrary path to open |
| III. No data loss | Recording only after a successful open; atomic config writes; no save/close/quit path touched |
| IV. Calm | Recency work is action-driven; nothing on the keystroke path; menu rebuild is ≤ 10 entries |
| V. Test what can corrupt/escape | recentItems store unit tests (tolerance, ordering, dedupe, cap, atomicity), IPC shape test, full e2e suite |
