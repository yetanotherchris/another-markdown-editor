# Data Model: Universal Config Path

## Entities

### Universal Config Path (spec "Key Entities")

The platform-independent location of the shared per-user config file.

| Property | Value |
|----------|-------|
| File | `config.json` |
| Directory (all platforms) | `~/.config/markdownmeister` |
| Directory (Linux, `$XDG_CONFIG_HOME` set) | `$XDG_CONFIG_HOME/markdownmeister` |
| Shared by | recent items, settings, window state, spellcheck dictionary |

### Legacy Config Path (spec "Key Entities")

The old platform-specific location migrated from.

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%/markdownmeister/config.json` |
| macOS | `~/Library/Application Support/markdownmeister/config.json` |
| Linux | `~/.config/markdownmeister/config.json` (== universal when XDG unset; nothing to migrate) |

### Test Seam

`MM_CONFIG_DIR` — when set, `recentItemsConfigPath()` returns
`<MM_CONFIG_DIR>/config.json` and the migration is skipped (FR-009/010; US4).

## Migration outcomes (`migrateConfigFile`)

| Legacy | Universal | Result | Action |
|--------|-----------|--------|--------|
| missing | missing | `nothing` | none |
| exists | missing | `migrated` | rename legacy → universal (mkdir parents); old removed (SC-003) |
| exists | exists | `new-wins` | keep universal; leave legacy (FR-007) |
| any | rename fails | `failed` | leave legacy; log; app continues with defaults (FR-008) |

## Validation / fallback rules

- Home directory unavailable (`os.homedir()` empty) → fall back to
  `appData/markdownmeister/config.json` (FR-011).
- `MM_CONFIG_DIR` set → universal/legacy logic bypassed entirely; migration
  MUST NOT run (US4 / FR-010).
- Directory creation happens on write (`mkdirSync(..., { recursive: true })`,
  FR-003).
- Migration is a rename, not a copy (Assumptions); all data preserved (FR-006).

## State transitions

None in the application's runtime state — only the on-disk file location
changes once, at startup.
