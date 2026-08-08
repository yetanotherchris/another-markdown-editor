# Feature Specification: Custom Editor Theme

**Feature Branch**: `023-custom-editor-theme`

**Created**: 2026-08-07

**Status**: Archived

**Input**: User description: "Store the theme colours and font type (serif/sans) in the config.json. If these don't match a theme, then 'custom' is displayed in settings dialog. Changing to a known theme in the settings will override the custom colours."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Custom theme colors and font persist (Priority: P1)

A user customizes the editor's appearance by selecting specific colors and a font typeface (serif or sans-serif). When they close and reopen the application, their custom appearance is restored exactly as they left it. The custom colors and font are stored in the configuration file.

**Why this priority**: Persistence of user preferences is fundamental. Without it, customization has no value.

**Independent Test**: Change the editor colors and font, restart the application, and verify the custom appearance is restored.

**Acceptance Scenarios**:

1. **Given** the user has customized editor colors and font, **When** they close and reopen the application, **Then** the editor displays with the same custom colors and font.
2. **Given** the user has a custom theme, **When** they inspect the configuration file, **Then** it contains the custom color values and font type.
3. **Given** the user has a custom theme, **When** they open the settings dialog, **Then** the editor theme dropdown shows "Custom" as the selected option.

---

### User Story 2 - Switching to a preset theme overrides custom values (Priority: P1)

A user who has customized colors and font decides to switch to a preset theme (e.g., "Rustic" or "Scholarly"). When they select the preset and save, the custom colors and font are replaced with the preset's values. The settings dialog now shows the preset name instead of "Custom".

**Why this priority**: Preset themes provide a quick way to get a polished look. Switching to a preset must fully apply that preset's appearance.

**Independent Test**: Start with a custom theme, select a preset theme in settings, save, and verify the editor appearance matches the preset and the dropdown shows the preset name.

**Acceptance Scenarios**:

1. **Given** the user has a custom theme (colors and font), **When** they select "Rustic" in the settings dialog and save, **Then** the editor displays with Rustic's colors and font.
2. **Given** the user switched from custom to a preset theme, **When** they inspect the configuration file, **Then** it contains the preset's `editorTheme` name and no custom color overrides.
3. **Given** the user switched to a preset theme, **When** they open the settings dialog, **Then** the dropdown shows the preset name (e.g., "Rustic"), not "Custom".

---

### User Story 3 - Modifying a preset creates a custom theme (Priority: P2)

A user starts with a preset theme (e.g., "Monotone") and changes one aspect (e.g., the background color or font type). The settings dialog immediately reflects that the theme is now "Custom" rather than the preset name. The modified appearance persists.

**Why this priority**: Users expect that tweaking a preset creates a personalized variant. The UI must accurately reflect the current state.

**Independent Test**: Select a preset theme, modify the background color, and verify the settings dialog shows "Custom" instead of the preset name.

**Acceptance Scenarios**:

1. **Given** the user has selected the "Scholarly" preset, **When** they change the background color, **Then** the settings dialog theme dropdown changes from "Scholarly" to "Custom".
2. **Given** the user modified a preset's color, **When** they restart the application, **Then** the editor displays the modified color and the settings dialog shows "Custom".
3. **Given** the user changed only the font (serif/sans) from a preset, **When** they open settings, **Then** the dropdown shows "Custom".

---

### User Story 4 - Custom theme detection is automatic (Priority: P2)

The application automatically determines whether the current colors and font match a known preset. If they match exactly, the preset name is shown. If any value differs, "Custom" is shown. The user does not manually toggle between "preset" and "custom" modes.

**Why this priority**: Automatic detection reduces cognitive load. Users should not need to understand the distinction between preset and custom modes.

**Independent Test**: Manually edit the config file to set colors that don't match any preset, launch the app, and verify the settings dialog shows "Custom".

**Acceptance Scenarios**:

1. **Given** the config file specifies colors and font that exactly match the "Rustic" preset, **When** the settings dialog opens, **Then** "Rustic" is shown as selected.
2. **Given** the config file specifies colors that differ from all presets by even one value, **When** the settings dialog opens, **Then** "Custom" is shown as selected.
3. **Given** the config file specifies a font type that differs from the preset matched by colors, **When** the settings dialog opens, **Then** "Custom" is shown as selected.

---

### Edge Cases

- What happens if the config file contains invalid color values (e.g., malformed hex codes)? The application falls back to the default preset (Rustic) and logs a warning. The invalid values are not persisted.
- What happens if a future version adds a new preset that matches the user's current custom values? The settings dialog will show the new preset name instead of "Custom". This is acceptable; the appearance is unchanged.
- What happens if the user manually edits the config file to set `editorTheme` to a preset name but also specifies custom colors? The custom colors take precedence, and the settings dialog shows "Custom".
- What happens to the existing `editorFont` setting (currently inert)? It becomes active again and is used to determine the font typeface. Its value is validated against the allowed set (`serif` or `sans-serif`).
- What happens if the user selects a preset but the preset's colors are not available (e.g., due to a code bug)? The application falls back to the default preset and logs an error. The settings dialog shows the fallback preset name.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The configuration file MUST store the editor's color values (background, foreground, accent, etc.) as individual properties.
- **FR-002**: The configuration file MUST store the editor's font type (`serif` or `sans-serif`).
- **FR-003**: The settings dialog MUST display "Custom" as the selected editor theme when the current colors and font do not exactly match any known preset.
- **FR-004**: The settings dialog MUST display the preset name (e.g., "Rustic", "Scholarly") when the current colors and font exactly match that preset.
- **FR-005**: When the user selects a preset theme and saves, the configuration MUST be updated to that preset's colors and font, and any custom color overrides MUST be cleared.
- **FR-006**: When the user modifies any color or font value while a preset is active, the effective theme MUST become "Custom" (no preset matches).
- **FR-007**: The application MUST automatically detect whether the current configuration matches a preset. No manual toggle between "preset" and "custom" modes is provided.
- **FR-008**: The existing `editorFont` setting MUST become active (no longer inert) and control the editor's typeface.
- **FR-009**: The configuration MUST remain backward-compatible: if `editorFont` or custom color properties are missing, the application MUST fall back to the default preset (Rustic).
- **FR-010**: Invalid color values in the configuration MUST be rejected, and the application MUST fall back to the default preset.

### Key Entities

- **Editor Theme Preset**: A named combination of colors and font type (e.g., "Rustic" = warm cream background, sans-serif font). The application ships with a fixed set of presets.
- **Custom Theme**: A configuration where the colors and/or font do not match any preset. The settings dialog displays "Custom" for this state.
- **Editor Colors**: The set of color values (background, foreground, accent, etc.) that define the editor's appearance. Stored individually in the configuration.
- **Editor Font**: The typeface choice (`serif` or `sans-serif`) for the editor canvas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After customizing colors and font and restarting the application, 100% of users see their custom appearance restored.
- **SC-002**: After switching from a custom theme to a preset theme, the settings dialog shows the preset name (not "Custom") in 100% of cases.
- **SC-003**: The settings dialog correctly displays "Custom" when colors or font differ from all presets, and displays the preset name when they match exactly.
- **SC-004**: The configuration file contains valid, parseable color values and font type after any theme change.
- **SC-005**: Existing users with the current configuration format (no custom colors, `editorFont` inert) experience no change in appearance or behavior after upgrade.

## Assumptions

- The set of editor theme presets is fixed at five: Rustic, Rustic Serif, Monotone, Monotone Serif, Scholarly. Adding new presets is out of scope for this feature.
- "Custom" is a display-only state in the settings dialog. It is not a selectable theme; users arrive at "Custom" by modifying values, not by choosing it.
- The configuration file format is extended to include individual color properties. The exact property names and structure are determined during planning.
- The `editorFont` setting, currently inert, becomes active and is used to determine the editor's typeface. Its existing values (`serif` or `sans-serif`) are retained.
- Color values are stored as hex codes (e.g., `#fdf6e3`). The set of color properties (background, foreground, accent, etc.) matches the CSS variables defined for the current presets.
- The "Custom" label is localized if the application supports multiple languages. For now, English-only is assumed.
- The feature does not introduce a UI for picking arbitrary colors (e.g., a color picker). Users can only achieve custom themes by manually editing the configuration file or by modifying a preset and saving. (A future feature may add a color picker UI.)

## Clarifications

*(Added during clarify step)*
