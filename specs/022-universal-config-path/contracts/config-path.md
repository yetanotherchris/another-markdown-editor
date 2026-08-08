# Contract: Config Path Resolution & Migration

The path-resolution and migration contract for spec 022. Main-process only; no
renderer surface changes.

## Path functions (`src/main/configPath.ts`)

| Function | Inputs | Returns |
|----------|--------|---------|
| `universalConfigDir({ homeDir, platform, xdgConfigHome })` | home dir, platform, optional XDG | `~/.config/markdownmeister`, or `$XDG_CONFIG_HOME/markdownmeister` on Linux (FR-001/002) |
| `universalConfigPath(parts)` | same | `universalConfigDir + /config.json` |
| `legacyConfigPath({ homeDir, platform, appDataDir })` | home dir, platform, appData dir | `appData/markdownmeister/config.json` (Windows/macOS), or `~/.config/markdownmeister/config.json` (Linux) (FR-005) |
| `migrateConfigFile(legacy, universal)` | two absolute paths | `'nothing' \| 'migrated' \| 'new-wins' \| 'failed'` (data-model table) |

## `recentItemsConfigPath()` precedence (unchanged seam)

1. `MM_CONFIG_DIR` set → `join(MM_CONFIG_DIR, 'config.json')` (FR-009/010).
2. `os.homedir()` empty → `appData/markdownmeister/config.json` fallback (FR-011).
3. else → `universalConfigPath(...)`.

## Startup migration hook (`index.ts` `app.whenReady`)

1. Skip when `MM_CONFIG_DIR` is set (US4 — never touch the real config in tests).
2. Skip when `os.homedir()` is empty (FR-011).
3. Skip when `legacy === universal` (Linux, XDG unset — nothing to migrate).
4. Else `migrateConfigFile(legacy, universal)`; log a warning on `failed` and
   continue (FR-008).

Runs before any `loadSettings()` / config read.

## Guarantees

- All data preserved (rename, FR-006); `new-wins` leaves the old file
  (FR-007); failure leaves the old file and the app continues (FR-008).
- Directory creation on write (FR-003).
- The `MM_CONFIG_DIR` seam behaves identically to before (FR-010), so the
  whole existing e2e suite keeps its isolation.

## Verification

- Unit (`tests/main/configPath.test.ts`): path values for win32/darwin/linux,
  XDG override, and all four migration outcomes.
- e2e (`tests/e2e/universal-config.spec.ts`): with `USERPROFILE`/`HOME`
  redirected to a temp home, the config lands at
  `<tempHome>/.config/markdownmeister/config.json`; a seeded
  `appData/markdownmeister/config.json` is migrated there; a missing `~/.config`
  is created on write; `MM_CONFIG_DIR` still isolates (existing suite).
