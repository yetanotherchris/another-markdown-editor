# Feature Specification: Settings Dialog

**Feature Branch**: `[012-settings-dialog]`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Settings dialog, which uses the same application config file location as the MRU files. For its first setting it should provide 2 fonts for the editor you can choose from: sans-serif and serif."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open the Settings Dialog (Priority: P1)

A user can open a settings dialog from the application's main menu. The dialog is clearly labeled and reachable without searching.

**Why this priority**: If the settings dialog cannot be found, no other settings-related user stories can begin.

**Independent Test**: A user can locate and open the settings dialog within 5 seconds from the main menu.

**Acceptance Scenarios**:

1. **Given** the application is open, **When** the user opens the main menu, **Then** a Settings or Preferences option is visible.
2. **Given** the user selects the Settings option, **When** the action completes, **Then** a settings dialog opens.
3. **Given** the settings dialog is open, **When** the user views it, **Then** the first setting shown is an editor font choice between sans-serif and serif.

---

### User Story 2 - Choose the Editor Font (Priority: P1)

A user can switch the editor's font family between a sans-serif and a serif option, and the choice is reflected in the editing surface.

**Why this priority**: The editor font choice is the first and only requested setting; it must work correctly and persist.

**Independent Test**: A user selects the serif font, sees the editor text change to a serif face, restarts the application, and verifies the editor still uses the serif font.

**Acceptance Scenarios**:

1. **Given** the settings dialog is open, **When** the user selects the sans-serif font option, **Then** the editor uses a sans-serif font and the choice is saved.
2. **Given** the settings dialog is open, **When** the user selects the serif font option, **Then** the editor uses a serif font and the choice is saved.
3. **Given** the user has selected a font and closed the settings dialog, **When** they reopen the dialog, **Then** the current font choice is selected.

---

### User Story 3 - Persist Settings Across Restarts (Priority: P1)

A user's settings choices survive application restarts, so the application always starts with their preferred configuration.

**Why this priority**: A setting that resets on restart is not a setting; persistence is essential for trust.

**Independent Test**: Change the font setting, close the application, reopen it, and verify the selected font is still applied.

**Acceptance Scenarios**:

1. **Given** the user has selected the serif font, **When** they close and reopen the application, **Then** the editor is rendered in the serif font.
2. **Given** the user has selected the sans-serif font, **When** they close and reopen the application, **Then** the editor is rendered in the sans-serif font.

---

### User Story 4 - Close the Settings Dialog Without Losing Work (Priority: P2)

A user can open and close the settings dialog without affecting the current document or its unsaved state.

**Why this priority**: Settings should be a safe, non-destructive action; changing a font must not discard or alter the user's text.

**Independent Test**: Open a document with unsaved changes, open the settings dialog, change the font, close the dialog, and verify the unsaved changes are intact.

**Acceptance Scenarios**:

1. **Given** the user has unsaved changes in the current document, **When** they open the settings dialog, **Then** the document remains dirty and the changes are not lost.
2. **Given** the user changes the font in the settings dialog, **When** the dialog closes, **Then** the document content and dirty state are unchanged.

---

### Edge Cases

- What happens when the configuration file is missing or unreadable? The settings dialog opens with default values (sans-serif) and writes a new configuration when a change is made.
- What happens when the configuration file is malformed? The application repairs or replaces the malformed settings entry without losing unrelated configuration data.
- What happens when the user cancels the settings dialog after making a change? The application should either apply the change immediately or offer a cancel/revert mechanism, depending on the chosen interaction model.
- What happens when the selected font cannot be loaded? The application falls back to a system-default sans-serif or serif font and reports the problem quietly.
- What happens when the settings dialog is already open and the user tries to open it again? The existing dialog is brought to the front rather than creating a duplicate.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST provide a settings dialog accessible from the main menu.
- **FR-002**: The settings dialog MUST store all settings in the same per-user application configuration file location used for the recent-items (MRU) list.
- **FR-003**: The settings dialog MUST include an editor font-family setting as its first setting.
- **FR-004**: The editor font-family setting MUST offer at least two options: sans-serif and serif.
- **FR-005**: The selected font MUST be applied to the document editing surface.
- **FR-006**: The selected font MUST persist across application restarts.
- **FR-007**: The settings dialog MUST be keyboard accessible (openable, navigable, and closable via keyboard).
- **FR-008**: The settings dialog MUST NOT discard or alter the content or dirty state of open documents.
- **FR-009**: The settings dialog MUST tolerate a missing or malformed configuration file by using safe defaults and writing a valid configuration when a setting is changed.

### Key Entities *(include if feature involves data)*

- **Settings**: The persisted user preferences stored in the per-user application configuration file. The first setting is the editor font-family choice.
- **Editor Font Setting**: A configuration value that selects between a sans-serif and a serif font family for the document editing surface.
- **Application Configuration File**: The per-user JSON file that holds both recent items and settings, located at the platform-appropriate configuration location.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can open the settings dialog from the main menu within 5 seconds.
- **SC-002**: A user can change the editor font and see the change applied within 5 seconds.
- **SC-003**: The selected font persists across 100% of clean application restarts.
- **SC-004**: In 100% of tests, opening the settings dialog and changing the font does not alter the content or dirty state of open documents.
- **SC-005**: In 100% of tests with a missing or malformed configuration file, the settings dialog opens with a default sans-serif font and successfully writes a valid configuration.

## Assumptions

- Settings are stored in the same per-user configuration file as the recent-items list, at the platform-appropriate location established by the Recent Items feature.
- The first setting is the editor font-family choice; additional settings will be added in future features.
- The specific font faces used for "sans-serif" and "serif" will be selected during planning from freely distributable fonts already available to the application.
- The font change applies to the document editing surface (WYSIWYG editor and source view, if applicable), not to the surrounding UI chrome. This includes the editor's toolbar/top bar: the toolbar stays in the application's sans-serif face while the document content uses the chosen font (clarification 2026-08-06).
- The settings dialog applies changes immediately or on explicit confirmation; either model is acceptable as long as it is consistent and predictable.
- Custom font uploads, font size, line height, and other typography settings are out of scope for this feature.
