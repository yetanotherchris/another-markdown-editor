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
every call (never cached at module load). This lets the e2e suite relocate the
config with `app.evaluate(({ app }) => app.setPath('appData', dir))` before the
first record, keeping tests isolated from the developer's real config. This is a
test seam, not a config override exposed to users.

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
time it runs. `refreshApplicationMenu(window)` is exported as a thin alias that
re-invokes it. Main handlers call it after any `recordRecentItem` /
`removeRecentItem`. Rebuilding is cheap (≤ 10 menu entries) and only happens on
user-driven open events, never on a keystroke path.

**Costs**: rebuilding the app menu discards any transient menu state — there is
none we depend on (no open menus are rebuilt mid-display in a realistic flow).

## R4 — Recent-open IPC must re-validate the path in main

**Finding**: a recent file may live outside the current workspace, so it cannot
be opened through the existing workspace-relative `file:read`. We must add a
way to open an absolute path. Principle I forbids a generic escape hatch;
Principle II says every path is untrusted.

**Decision**: two named operations, both validated against main's own stored
recent-items list *before* any filesystem access:

- `recent:openFile(path)` → `Result<OpenedFile>`
- `recent:openFolder(path)` → `Result<WorkspaceInfo>`

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
   - Folder: `realpathSync`, replace `WorkspaceState`, return entries (mirrors
     `workspace:openDialog`).
4. `recordRecentItem(…)` to bump the entry to the front (FR-006), rebuild menu.

**Why this preserves the boundary**: the renderer cannot read arbitrary paths —
it can only request paths that main itself recorded earlier (from real,
successful user opens). A compromised renderer gets nothing new: it could not
have caused main to record a path main did not open. The existing dialog
handlers (`file:openDialog`) remain the only way new paths enter the list.

**Failure semantics (FR-009/FR-010)**: a failed open removes the entry and
returns a typed error; the renderer shows it in-context and leaves the session
untouched. A cancelled unsaved-work confirmation (future, if a folder-open
confirmation is ever added) would flow through the *renderer* — recent folder
open routes through the exact same `REPLACE` dispatch as File > Open Folder, so
whatever safeguards that path has (today: none — REPLACE never touches the
documents reducer, so no words can be lost) apply identically.

## Decisions validated against the constitution

| Principle | Check |
|-----------|-------|
| I. Process isolation | Config I/O and path logic all in main; renderer gains two named IPC ops + an object menu command, all typed in `ipc-contract.ts` |
| II. Path safety | Recent-open re-validates against the sanctioned list and realpath-resolves in main; failures close typed; renderer never picks an arbitrary path to open |
| III. No data loss | Recording only after a successful open; atomic config writes; no save/close/quit path touched |
| IV. Calm | Recency work is action-driven; nothing on the keystroke path; menu rebuild is ≤ 10 entries |
| V. Test what can corrupt/escape | recentItems store unit tests (tolerance, ordering, dedupe, cap, atomicity), IPC shape test, full e2e suite |
