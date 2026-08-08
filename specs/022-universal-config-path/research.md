# Research: Universal Config Path

## R1 — Redirect through the single `recentItemsConfigPath()` seam

**Decision**: rewrite `recentItemsConfigPath()` to return the universal path
(or the `MM_CONFIG_DIR` override), and keep every other module untouched.

**Rationale**: every config consumer — settings (`settings.ts`), window state
(`windowState.ts`), recent items (`recentItems.ts`/`recentItemsPath.ts`), the
spellcheck dictionary, and `workspaceExplorerState.ts` — already routes through
this one function. Changing the resolver moves the entire config atomically; the
`MM_CONFIG_DIR` branch (FR-009/010) is preserved verbatim.

**Alternatives considered**: changing each consumer separately (rejected —
duplication and drift); a second env-style indirection (rejected — one seam is
enough).

## R2 — Pure path functions in a new `configPath.ts`

**Decision**: `universalConfigDir`, `legacyConfigPath`, and `migrateConfigFile`
live in a new electron-free-as-possible module; `recentItemsPath.ts` keeps the
thin Electron/`os` glue.

**Rationale**: `os.homedir()`, `$XDG_CONFIG_HOME`, and the platform come in as
parameters so the path logic is unit-testable without Electron or a real home
(FR-001/002/005). This mirrors the established `settingsFile`/`recentItemsPath`
pure-logic split.

**Alternatives considered**: inline logic in `recentItemsPath.ts` (rejected —
the migration's four outcomes deserve direct tests).

## R3 — Migration is a guarded startup rename

**Decision**: `index.ts` runs the migration first inside `app.whenReady()`,
skipping it when `MM_CONFIG_DIR` is set, when `os.homedir()` is empty (FR-011),
or when legacy equals universal (Linux without XDG — FR-005 makes them the same
path).

**Rationale**: the migration MUST run before the first `loadSettings()` reads
the config, and MUST NOT run under the test seam (tests redirect config to temp
dirs and must never move the developer's real config). `fs.renameSync` is the
spec's "move, not copy" (Assumptions); `new-wins` and failure-keeps-old match
FR-007/008.

**Alternatives considered**: lazy migration on first read (rejected — multiple
readers make "first" ambiguous); copy-then-delete (rejected — the spec mandates
rename).

## R4 — e2e isolation via redirected `USERPROFILE`/`HOME`

**Decision**: the e2e suite launches Electron with a temp `USERPROFILE`
(Windows) / `HOME` (macOS/Linux), so both `os.homedir()` and
`app.getPath('appData')` resolve under the temp home. This exercises the real
universal path and the migration without `MM_CONFIG_DIR` and without touching
the developer's profile.

**Rationale**: on Windows, `%APPDATA%` = `%USERPROFILE%\AppData\Roaming` and
Node's `os.homedir()` reads `USERPROFILE`, so a single env override redirects
both the legacy (appData) and universal (`~/.config`) locations. This is the
only way to e2e-test the migration deterministically.

**Alternatives considered**: seeding the real home (rejected — pollutes the
developer's profile, violating US4's whole point).
