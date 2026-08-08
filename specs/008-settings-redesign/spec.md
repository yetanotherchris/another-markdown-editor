# Feature Specification: Settings Redesign

**Feature Branch**: `008-settings-redesign`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "Make the settings window wider, introduce a tailwind-style sidebar navigation for areas. Two areas: general, theme. Use a toggle component similar to that found in tailwind css forms. Move the existing settings into the relevant area. Add a new setting for open file in same tab, or open in new tab. Add a new setting: toggle developer tools moved to settings. Bug: small pages don't have full background colour in the editor. Change the view source icon to hero icons code-bracket-square, make it dark blue."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate settings by area (Priority: P1)

A writer can open the settings dialog and switch between distinct areas of configuration using a persistent sidebar, so that related options are grouped and easy to find without scrolling through a single long list.

**Why this priority**: The current single-column layout mixes unrelated concerns (appearance, editing behaviour, debugging) and will become harder to navigate as more settings are added.

**Independent Test**: Open the settings dialog, verify that a sidebar with labelled area entries is visible, select each area in turn, and confirm that only the settings belonging to that area are shown in the main panel.

**Acceptance Scenarios**:

1. **Given** the settings dialog is open, **When** the user looks at the dialog layout, **Then** a sidebar is visible on the left side containing entries for at least `General` and `Theme`.
2. **Given** the settings dialog is open and the `General` area is selected, **When** the user reads the main panel, **Then** the panel shows only settings related to editing and application behaviour.
3. **Given** the settings dialog is open and the `Theme` area is selected, **When** the user reads the main panel, **Then** the panel shows only settings related to visual appearance.
4. **Given** the settings dialog is open, **When** the user selects a different area in the sidebar, **Then** the main panel updates to show the settings for that area and the selected sidebar entry is visually highlighted.
5. **Given** the settings dialog is open, **When** the user opens it again after a previous session, **Then** the dialog opens with the first area (`General`) selected by default.

---

### User Story 2 - Configure file-opening behaviour (Priority: P1)

A writer can choose whether opening a file from the explorer replaces the current tab or always opens a new tab, so that the application matches their preferred working style.

**Why this priority**: The current behaviour (replace clean tab, open new tab only when dirty or middle-clicked) is implicit and cannot be changed. Users who prefer one-tab-per-file need an explicit option.

**Independent Test**: Open the settings dialog, change the file-opening preference, then open files from the explorer and verify that the tab behaviour matches the selected preference.

**Acceptance Scenarios**:

1. **Given** the settings dialog is open in the `General` area, **When** the user looks for a file-opening option, **Then** a setting is present that lets them choose between opening files in the same tab and opening files in a new tab.
2. **Given** the file-opening preference is set to "same tab", **When** the user opens a file from the explorer while a clean document is active, **Then** the active tab is replaced with the new file.
3. **Given** the file-opening preference is set to "new tab", **When** the user opens a file from the explorer, **Then** a new tab is created for the file and the previously active tab remains open.
4. **Given** the file-opening preference is set to "new tab", **When** the user opens a file that is already open in another tab, **Then** the existing tab for that file is activated without creating a duplicate.
5. **Given** the file-opening preference has been changed, **When** the settings dialog is closed and reopened, **Then** the preference reflects the last saved value.

---

### User Story 3 - Toggle developer tools from settings (Priority: P2)

A writer can enable or disable developer tools from the settings dialog, moving the toggle out of the hamburger menu and into a dedicated location.

**Why this priority**: Developer tools are a debugging aid that most writers will rarely need. Placing the toggle in settings keeps the primary menu uncluttered while still making the feature available.

**Independent Test**: Open the settings dialog, locate the developer tools toggle, change its state, and verify that the application's developer tools behaviour matches the toggle state.

**Acceptance Scenarios**:

1. **Given** the settings dialog is open in the `General` area, **When** the user looks for a developer tools option, **Then** a toggle setting for developer tools is present.
2. **Given** the developer tools toggle is enabled, **When** the user uses the developer tools keyboard shortcut, **Then** the developer tools open as expected.
3. **Given** the developer tools toggle is disabled, **When** the user looks at the hamburger menu, **Then** the "Toggle Developer Tools" menu item is no longer present in the hamburger menu.
4. **Given** the developer tools toggle has been changed, **When** the settings dialog is closed and reopened, **Then** the toggle reflects the last saved value.

---

### User Story 4 - View the editor with correct background on short documents (Priority: P1)

A writer sees a consistent editor background colour across the full visible area, even when the document content is shorter than the editor viewport.

**Why this priority**: A visible colour break below short documents is a visual defect that undermines the editor theme and looks unfinished.

**Independent Test**: Open a document with only a few lines of content, observe the editor area below the last line, and verify that the background colour matches the editor theme's canvas colour rather than showing a different colour.

**Acceptance Scenarios**:

1. **Given** a document has fewer lines than the editor viewport height, **When** the user looks at the area below the last line, **Then** the background colour matches the editor theme's canvas colour.
2. **Given** the editor theme is a themed preset (e.g., Rustic), **When** a short document is displayed, **Then** the area below the content uses the same warm cream colour as the content area, not the default application background.
3. **Given** the application is in dark mode, **When** a short document is displayed, **Then** the area below the content matches the editor theme's dark canvas colour.
4. **Given** the user scrolls a short document, **When** the content does not fill the viewport, **Then** the background remains consistent and does not flash or change colour.

---

### User Story 5 - Identify the view source action by its updated icon (Priority: P2)

A writer can visually identify the "view source" action in the editor toolbar by its updated icon, which uses a distinct bracket-square glyph in dark blue.

**Why this priority**: The icon change improves recognisability and aligns the action's visual language with the rest of the application's icon set.

**Independent Test**: Open a document in the editor, locate the view source button in the toolbar, and verify that its icon matches the code-bracket-square glyph and is rendered in dark blue.

**Acceptance Scenarios**:

1. **Given** a document is open in the formatted editor, **When** the user looks at the toolbar, **Then** the view source button displays a code-bracket-square icon.
2. **Given** the view source button is rendered, **When** the user observes its colour, **Then** the icon is dark blue.
3. **Given** the application is in light or dark mode, **When** the view source button is displayed, **Then** the dark blue icon remains visible and legible against both backgrounds.

---

### Edge Cases

- The settings dialog is resized to a very narrow width: the sidebar and main panel remain usable; the sidebar does not collapse or overlap the main panel contents.
- The settings dialog is opened when no document is open: all areas and settings remain accessible and functional.
- A setting is changed and the dialog is closed abruptly (e.g., application closed): the last saved value is preserved; partially applied changes do not corrupt the settings file.
- The view source button is the only toolbar button: it still displays the correct icon and colour.
- The editor theme is changed while a short document is open: the background colour below the content updates to match the new theme immediately.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The settings dialog MUST be wider than the current implementation to accommodate a sidebar layout.
- **FR-002**: The settings dialog MUST contain a sidebar navigation area with entries for at least `General` and `Theme`.
- **FR-003**: Selecting a sidebar entry MUST display only the settings belonging to that area in the main panel.
- **FR-004**: The active sidebar entry MUST be visually distinct from inactive entries.
- **FR-005**: The settings dialog MUST default to the `General` area when first opened.
- **FR-006**: Boolean settings MUST use a toggle control visually similar to Tailwind CSS form toggles (a sliding pill on a track).
- **FR-007**: The `General` area MUST contain the spellcheck settings (enable/disable and language selection).
- **FR-008**: The `General` area MUST contain a file-opening behaviour setting allowing the user to choose between "open in same tab" and "open in new tab".
- **FR-009**: The `General` area MUST contain a toggle for developer tools.
- **FR-010**: When the developer tools toggle is disabled, the "Toggle Developer Tools" item MUST be removed from the hamburger menu.
- **FR-011**: When the developer tools toggle is enabled, the developer tools keyboard shortcuts MUST continue to function.
- **FR-012**: The `Theme` area MUST contain the application theme setting (light, dark, system default).
- **FR-013**: The `Theme` area MUST contain the editor theme setting (the named preset selector).
- **FR-014**: The editor area MUST display the editor theme's canvas background colour across the full visible height, including below short documents whose content does not fill the viewport.
- **FR-015**: The "view source" toolbar button MUST use the hero icons `code-bracket-square` glyph.
- **FR-016**: The "view source" toolbar button icon MUST be rendered in dark blue.
- **FR-017**: All new settings MUST be persisted using the existing settings persistence mechanism and survive application restarts.
- **FR-018**: The file-opening behaviour setting MUST affect all file-open actions originating from the explorer (single-click, context menu "Open").

### Key Entities

- **Settings area**: A named grouping of related settings displayed in the main panel when its sidebar entry is selected.
- **Toggle control**: A boolean input rendered as a sliding pill on a track, providing a clear on/off visual state.
- **File-opening behaviour**: A user preference that determines whether opening a file from the explorer replaces the active tab or creates a new tab.
- **Developer tools toggle**: A boolean setting that controls the availability of developer tools keyboard shortcuts and the hamburger menu item.
- **Editor canvas background**: The background colour of the editor theme that must extend to fill the full visible editor area regardless of document length.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of settings dialog tests, the sidebar contains at least `General` and `Theme` entries and the main panel shows only the settings for the selected area.
- **SC-002**: In 100% of file-opening tests, the tab behaviour matches the user's selected preference (same tab vs. new tab) for explorer-originated opens.
- **SC-003**: In 100% of short-document tests, the area below the last line of content uses the editor theme's canvas colour, with no visible colour break.
- **SC-004**: In 100% of icon tests, the view source button displays the code-bracket-square glyph in dark blue.
- **SC-005**: In usability testing, at least 90% of users can locate a specific setting within 10 seconds of opening the dialog.
- **SC-006**: In 100% of persistence tests, changed settings survive an application restart and are restored to their last saved value.

## Assumptions

- **Sidebar scope**: Only two areas (`General` and `Theme`) are required for this feature. Additional areas may be added in future features without restructuring the sidebar.
- **Toggle styling**: The toggle component should visually match the Tailwind CSS forms toggle aesthetic (rounded pill, smooth transition, accent colour for the "on" state). The exact implementation (CSS custom properties, component library) is a planning concern.
- **Developer tools default**: The developer tools toggle defaults to disabled (off), matching the current behaviour where developer tools are not expected to be open for normal use.
- **File-opening default**: The file-opening behaviour defaults to the current behaviour (replace clean tab) to avoid surprising existing users.
- **Icon colour**: "Dark blue" is interpreted as a visually distinct dark blue that is legible against both light and dark editor backgrounds. The exact hex value is a planning concern.
- **Scope of bug fix**: The background colour fix applies to the editor area only. Other panels (explorer, tabs, status bar) are not affected.
- **Hamburger menu**: The "Toggle Developer Tools" item is removed from the hamburger menu as part of moving it to settings. The keyboard shortcuts remain available when the toggle is enabled.
