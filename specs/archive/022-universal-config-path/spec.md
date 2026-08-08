# Feature Specification: Universal Config Path

**Feature Branch**: `022-universal-config-path`

**Created**: 2026-08-07

**Status**: Archived

**Input**: User description: "Store config in .config universally, a subfolder of .config maybe called markdownmeister"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Config location is consistent across platforms (Priority: P1)

A user switches between Windows, macOS, and Linux and finds the configuration file in the same relative location on each platform: `~/.config/markdownmeister/config.json`. The user can manually locate, edit, or back up their settings without learning platform-specific paths.

**Why this priority**: The core value proposition is predictability. If the path varies by platform, the feature fails its purpose.

**Independent Test**: Install the application on each platform and verify the config file exists at `~/.config/markdownmeister/config.json` after first launch.

**Acceptance Scenarios**:

1. **Given** the application is launched on Windows for the first time, **When** the config file is created, **Then** it is located at `%USERPROFILE%/.config/markdownmeister/config.json`.
2. **Given** the application is launched on macOS for the first time, **When** the config file is created, **Then** it is located at `~/.config/markdownmeister/config.json`.
3. **Given** the application is launched on Linux for the first time, **When** the config file is created, **Then** it is located at `~/.config/markdownmeister/config.json` (or `$XDG_CONFIG_HOME/markdownmeister/config.json` if set).
4. **Given** the user inspects the config directory, **When** they list its contents, **Then** they see `config.json` containing both recent items and settings.

---

### User Story 2 - Existing config is migrated automatically (Priority: P1)

A user who previously used the application has their existing configuration (recent items, settings) automatically moved from the old platform-specific location to the new universal location. No data is lost; the user does not need to manually copy files.

**Why this priority**: Existing users must not lose their recent items list or settings preferences. Silent data loss violates Principle III.

**Independent Test**: Install the new version over an existing installation with a populated config, launch the app, and verify the old config file is gone and the new one contains all the same data.

**Acceptance Scenarios**:

1. **Given** a Windows user has an existing config at `%APPDATA%/markdownmeister/config.json`, **When** they launch the new version, **Then** the file is moved to `%USERPROFILE%/.config/markdownmeister/config.json` and the old location is empty.
2. **Given** a macOS user has an existing config at `~/Library/Application Support/markdownmeister/config.json`, **When** they launch the new version, **Then** the file is moved to `~/.config/markdownmeister/config.json` and the old location is empty.
3. **Given** a Linux user has an existing config at `~/.config/markdownmeister/config.json`, **When** they launch the new version, **Then** the file is moved to `~/.config/markdownmeister/config.json` and the old location is empty.
4. **Given** a user has both an old config and a new config (manual intervention), **When** they launch the app, **Then** the new config is preserved and the old config is not overwritten (new takes precedence).

---

### User Story 3 - Config directory is created if missing (Priority: P2)

A user launches the application on a fresh system where `~/.config` does not exist. The application creates the necessary directory structure before writing the config file.

**Why this priority**: The app must not fail to save settings because a directory is missing. This is a basic robustness requirement.

**Independent Test**: Delete `~/.config` (or use a test environment where it doesn't exist), launch the app, change a setting, and verify the directory and file are created.

**Acceptance Scenarios**:

1. **Given** the `~/.config` directory does not exist, **When** the application launches and writes config, **Then** `~/.config/markdownmeister/` is created and `config.json` is written inside it.
2. **Given** the `~/.config/markdownmeister` directory does not exist but `~/.config` does, **When** the application writes config, **Then** `~/.config/markdownmeister/` is created and `config.json` is written inside it.
3. **Given** directory creation fails (permission denied), **When** the application attempts to save config, **Then** the save fails gracefully (settings remain in memory, error logged) and the application continues running.

---

### User Story 4 - Test suite can isolate config (Priority: P2)

A developer running the test suite can point the application at an isolated config directory without affecting their personal config. Each test run uses a fresh, temporary config location.

**Why this priority**: Tests must be isolated and repeatable. A test that modifies the developer's real config is a bug.

**Independent Test**: Run the test suite with the test seam environment variable set, and verify the developer's real `~/.config/markdownmeister/config.json` is untouched.

**Acceptance Scenarios**:

1. **Given** the test seam environment variable is set to a temporary directory, **When** the application launches, **Then** config is read from and written to that directory, not `~/.config/markdownmeister/`.
2. **Given** the test suite completes, **When** the developer inspects their personal config, **Then** it is unchanged.

---

### Edge Cases

- What happens if `~/.config` exists but is not writable? The application logs the error and continues running with in-memory settings. The user's changes are not persisted but the app does not crash.
- What happens if the old config exists but is not readable (permission denied)? The application treats it as a missing config and starts with defaults. The old file is left in place (not moved) since it couldn't be read.
- What happens if the old config exists and the new config also exists (user manually copied it)? The new config takes precedence. The old config is left in place (not deleted) to avoid data loss if the user made manual edits.
- What happens if the home directory cannot be determined? The application falls back to the platform-specific `appData` location (current behavior) and logs a warning. This maintains backward compatibility.
- What happens to the `MM_CONFIG_DIR` test seam? It remains as `MM_CONFIG_DIR` (MM = MarkdownMeister). The name is unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The configuration file MUST be stored at `~/.config/markdownmeister/config.json` on all platforms (where `~` is the user's home directory).
- **FR-002**: On Linux, if `$XDG_CONFIG_HOME` is set, the path MUST be `$XDG_CONFIG_HOME/markdownmeister/config.json`.
- **FR-003**: The application MUST create the `~/.config/markdownmeister/` directory if it does not exist (including parent directories).
- **FR-004**: The application MUST perform a one-time migration from the old platform-specific location to the new universal location.
- **FR-005**: The old platform-specific locations are:
  - Windows: `%APPDATA%/markdownmeister/config.json`
  - macOS: `~/Library/Application Support/markdownmeister/config.json`
  - Linux: `~/.config/markdownmeister/config.json`
- **FR-006**: Migration MUST preserve all data (recent items and settings). No data loss is acceptable.
- **FR-007**: If both old and new config files exist, the new config takes precedence and the old config is left in place (not deleted).
- **FR-008**: If migration fails (old file unreadable or new location unwritable), the application MUST continue running with defaults and log the error.
- **FR-009**: The test seam environment variable MUST remain `MM_CONFIG_DIR` (MM = MarkdownMeister).
- **FR-010**: When the test seam is set, the application MUST use that directory for config, bypassing the universal path logic.
- **FR-011**: If the home directory cannot be determined, the application MUST fall back to the platform-specific `appData` location (current behavior).

### Key Entities

- **Universal Config Path**: The platform-independent location `~/.config/markdownmeister/config.json` where the application stores its configuration.
- **Legacy Config Path**: The old platform-specific locations (`appData/markdownmeister/config.json`) from which config is migrated.
- **Test Seam**: An environment variable (`MM_CONFIG_DIR`) that overrides the config path for test isolation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After first launch on a fresh install, the config file exists at `~/.config/markdownmeister/config.json` on all three platforms (Windows, macOS, Linux).
- **SC-002**: After upgrading from the previous version, the config file exists at the new location and contains all recent items and settings from the old location.
- **SC-003**: The old config file is removed after successful migration (unless the new config already existed).
- **SC-004**: The test suite passes without modifying the developer's personal config file.
- **SC-005**: The `MM_CONFIG_DIR` test seam continues to work for test isolation.
- **SC-006**: The application launches successfully even if `~/.config` does not exist or is not writable.

## Assumptions

- The config subfolder name is `markdownmeister`, matching the application name
  (spec 019). The folder name is stable and independent of display-name changes
  once set.
- The home directory is available via standard OS APIs on all platforms. Fallback to `appData` is provided for edge cases.
- Users do not manually edit the config file while the application is running. If they do, changes may be overwritten on the next save (current behavior, unchanged).
- The migration is a file move (rename), not a copy. If the move fails, the old file is left in place.
- The `MM_CONFIG_DIR` test seam is unchanged. MM stands for MarkdownMeister.
- XDG Base Directory Specification compliance on Linux: `$XDG_CONFIG_HOME` takes precedence over `~/.config` if set.

## Clarifications

*(Added during clarify step)*

- **2026-08-08 (spec 019 rename)**: The config subfolder was renamed to
  `markdownmeister` to match the renamed application (spec 019 FR-015). The
  config-path test seam was renamed to `MM_CONFIG_DIR` in step with the
  full-cleanup decision (spec 019 plan Decision log), and the legacy migration
  sources were renamed to the post-rename locations (`…/markdownmeister/…`),
  since the pre-rename config folder is itself renamed as part of spec 019.
