# Feature Specification: Theme Setting

**Feature Branch**: `[013-theme-setting]`

**Created**: 2026-08-05

**Status**: Archived

**Input**: User description: "A dark and light theme as a setting, and being able to use the system default."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose a Light Theme (Priority: P1)

A user can select a light theme from the settings, and the application's main interface immediately switches to a light color scheme.

**Why this priority**: Light theme is one of the three requested modes and is the default for many users.

**Independent Test**: Open the theme setting, select light, and verify the main interface uses a light palette.

**Acceptance Scenarios**:

1. **Given** the theme setting is set to light, **When** the user views the main interface, **Then** the UI chrome is rendered in a light color scheme.
2. **Given** the theme setting is set to light, **When** the user closes and reopens the application, **Then** the UI remains in the light theme.

---

### User Story 2 - Choose a Dark Theme (Priority: P1)

A user can select a dark theme from the settings, and the application's main interface immediately switches to a dark color scheme.

**Why this priority**: Dark theme is one of the three requested modes and is expected by many desktop users.

**Independent Test**: Open the theme setting, select dark, and verify the main interface uses a dark palette.

**Acceptance Scenarios**:

1. **Given** the theme setting is set to dark, **When** the user views the main interface, **Then** the UI chrome is rendered in a dark color scheme.
2. **Given** the theme setting is set to dark, **When** the user closes and reopens the application, **Then** the UI remains in the dark theme.

---

### User Story 3 - Use the System Default Theme (Priority: P1)

A user can select a system-default theme option, and the application follows the operating system's current appearance. If the OS changes, the application updates accordingly.

**Why this priority**: System-default is the third requested mode; it lets the application fit the user's environment without manual switching.

**Independent Test**: Set the theme to system default, change the OS appearance, and verify the application matches the new OS theme.

**Acceptance Scenarios**:

1. **Given** the theme setting is set to system default, **When** the OS is in light mode, **Then** the application uses the light theme.
2. **Given** the theme setting is set to system default, **When** the OS is in dark mode, **Then** the application uses the dark theme.
3. **Given** the theme setting is set to system default and the OS switches from light to dark, **When** the switch completes, **Then** the application updates to the dark theme without requiring a restart.

---

### User Story 4 - Persist the Theme Choice (Priority: P1)

A user's theme choice is remembered across application restarts.

**Why this priority**: Like any setting, the theme choice must survive restarts so the application always starts in the user's preferred mode.

**Independent Test**: Change the theme, close the application, reopen it, and verify the theme is restored.

**Acceptance Scenarios**:

1. **Given** the user has selected dark theme, **When** they restart the application, **Then** the UI opens in dark theme.
2. **Given** the user has selected system default, **When** they restart the application, **Then** the application resumes following the OS theme.

---

### Edge Cases

- What happens when the OS does not report a theme preference? The application falls back to the light theme.
- What happens when the configuration file is missing or malformed? The application uses a default theme (light or system default) and writes a valid configuration when the user changes it.
- What happens when the theme changes while a transition is in progress? The transition completes cleanly and shows the correct theme.
- What happens when the user is in the settings dialog and the OS theme changes? The dialog and the rest of the application update consistently.
- What happens when the application has a custom color theme in the future? The light/dark/system-default setting takes precedence over any ad-hoc color overrides for the UI chrome and the editor surface.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST provide a theme setting with three options: light, dark, and system default.
- **FR-002**: Selecting the light theme MUST apply the light color scheme to the main application UI.
- **FR-003**: Selecting the dark theme MUST apply the dark color scheme to the main application UI.
- **FR-004**: Selecting the system-default theme MUST make the application use the operating system's current light or dark mode.
- **FR-005**: The application MUST detect changes to the OS theme while running and update the UI when the system-default option is selected.
- **FR-006**: The theme setting MUST persist across application restarts.
- **FR-007**: The theme setting MUST be accessible from the settings dialog.
- **FR-008**: The theme change MUST apply without requiring an application restart.
- **FR-009**: The theme change MUST apply to the main window UI chrome and other in-scope UI surfaces.
- **FR-010**: The WYSIWYG editor content area MUST follow the theme: in light mode it keeps its existing light styling, and in dark mode it renders a dark editing surface (canvas, text, and the surrounding editor region). The editor must remain fully readable in both modes.

### Key Entities *(include if feature involves data)*

- **Theme Setting**: The persisted user preference that selects one of three modes: light, dark, or system default.
- **Theme Mode**: The resolved effective appearance (light or dark) derived from the theme setting and, when applicable, the operating system's current mode.
- **Application Configuration File**: The per-user JSON file that holds the theme setting, located at the platform-appropriate configuration location.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can switch between light, dark, and system-default themes in under 3 seconds.
- **SC-002**: The selected theme persists across 100% of clean application restarts.
- **SC-003**: When the system-default option is selected, the application matches the OS theme in 100% of tests.
- **SC-004**: When the OS theme changes while the application is running and system default is selected, the application updates within 5 seconds.
- **SC-005**: In 100% of tests, the theme change does not require an application restart.
- **SC-006**: In 100% of tests, the WYSIWYG editor content area follows the selected theme — a dark surface in dark mode, the existing light surface in light mode — and stays readable in both.

## Assumptions

- The theme setting is stored in the per-user application configuration file, at the same platform-appropriate location used by the Recent Items feature and other settings.
- The theme applies to the main window UI chrome AND the WYSIWYG editor content area (FR-010): the editor canvas and source view use a dark surface in dark mode and keep their light styling in light mode.
- The light and dark palettes will be defined during planning and will align with the application's existing or planned color tokens.
- Custom themes, per-workspace themes, and automatic time-based theme switching are out of scope.
- If the operating system does not provide a theme preference, the system-default option falls back to the light theme.

## Clarifications

- **2026-08-06**: The theme setting is the existing persisted `themeOverride`
  field (`'light' | 'dark' | null`) introduced in spec 010 — `null` is the
  "System default" option and is the default for a fresh install. No new setting
  or storage was added; the spec's "Theme Setting" entity maps to that field.
- **2026-08-06**: The palettes are defined in `plan.md` — the existing light
  `--ame-*` tokens plus a dark block under `.app-container[data-theme='dark']`.
  The effective appearance resolves through the renderer's
  `prefers-color-scheme` query (light/dark are forced by the choice; system
  follows the query live), with `nativeTheme.themeSource` set in main for the
  native chrome. The OS-never-reports case is satisfied by Chromium always
  answering light or dark (light is the fallback when the OS reports none).
- **2026-08-06**: FR-010 was amended (user decision) to bring the WYSIWYG editor
  content area into scope: in dark mode the editor renders a dark surface via
  Crepe's `--crepe-color-*` tokens, with the surrounding editor region, empty
  state, and source view following. This takes the editing-surface slice that the
  future `016-editor-theme` spec would otherwise own; 016 should build on the
  tokens introduced here rather than re-decide them.

## Dark theme palette (user decision 2026-08-06)

The dark theme uses the VS Code Dark palette below. The palette's deep-blue
button accent (`#0E639C`) is deliberately **not** used — buttons are a neutral
grey so the theme carries no blue accent; `#3794FF` is kept for links, text
highlights, and focus indicators.

| Role | Colour |
|------|--------|
| Main editor / window background | `#1F1F1F` (Dark Charcoal) |
| Sidebar file explorer | `#181818` (Near Black) |
| Primary text (editor body + UI text) | `#8C8C8C` (Mid Gray) |
| Header text in the editor (headings) | `#CCCCCC` (Off-White) |
| Links, text highlights, focus | `#3794FF` (Bright Sky Blue) |
| Buttons (neutral, replacing `#0E639C`) | a mid-grey tone aligned with the chrome |

Derived greys (borders, surfaces, active tabs, hover/selection states) are shades
of the two charcoal backgrounds so the whole dark theme stays monochrome except
for the link/highlight blue. Light mode is unchanged.
