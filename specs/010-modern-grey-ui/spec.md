# Feature Specification: Modern Grey UI

**Feature Branch**: `[010-modern-grey-ui]`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "I want to create a new spec - to make the appearance look like a rounded corner, modern grey look. You may need to ask some clarifying questions for this, but this is largely about the hamburger menu, for '+' instead of 'new file', using the same tabbed interface. Next to the hamburger menu there should be an icon for the file explorer, to toggle the explorer on the left visible or not. The same colours as the rounded corner, modern grey look should be used which I can find if needed."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recognize and Use the Primary Workspace Controls (Priority: P1)

A user opens the application and immediately sees the primary workspace controls styled to match a rounded corner, modern grey look. The hamburger menu, file explorer toggle, tab bar, and new-file button are visually consistent with the reference look and clearly identifiable.

**Why this priority**: The visual appearance of the primary chrome is the core of this feature; if the controls are not recognizable or consistent with the reference, the feature has not delivered its value.

**Independent Test**: A user who has seen the rounded corner, modern grey reference can identify the hamburger menu, explorer toggle, tab bar, and + button within 5 seconds of opening the app.

**Acceptance Scenarios**:

1. **Given** the application is open on a workspace, **When** the user looks at the top-left of the window, **Then** they see a hamburger menu icon and an adjacent file explorer icon.
2. **Given** the user has opened the application, **When** they look at the tab bar, **Then** they see inactive tabs with truncated labels, an active tab rendered as a light gray pill (`#EAEAEA`) with an edit icon, filename label, and close button, and a "+" button immediately following the active tab for creating a new file.
3. **Given** the user compares the application to the rounded corner, modern grey reference, **When** they inspect the colors, icons, and layout, **Then** the two appear visually consistent.

---

### User Story 2 - Toggle the File Explorer Panel (Priority: P1)

A user can show or hide the file explorer panel on the left using a single click on the explorer toggle icon next to the hamburger menu. The chosen state persists across restarts.

**Why this priority**: Screen real estate is valuable; users need a fast, predictable way to focus on writing without losing their preferred layout.

**Independent Test**: A user can collapse and restore the explorer in under 2 seconds, and the state is restored after closing and reopening the application.

**Acceptance Scenarios**:

1. **Given** the explorer panel is visible, **When** the user clicks the explorer toggle icon, **Then** the panel hides and the editor area expands to use the available width.
2. **Given** the explorer panel is hidden, **When** the user clicks the explorer toggle icon again, **Then** the panel reappears with its previous width.
3. **Given** the user has hidden the explorer and closed the application, **When** they reopen the application, **Then** the explorer remains hidden.

---

### User Story 3 - Create a New File from the + Button (Priority: P2)

A user can create a new file by clicking the "+" button in the tab bar area, which replaces the existing "New File" text button. A new untitled file is opened in a new tab.

**Why this priority**: This is a frequently used action that should be visually compact and consistent with the rounded corner, modern grey tabbed interface.

**Independent Test**: A user can create a new file from the + button in under 3 seconds.

**Acceptance Scenarios**:

1. **Given** the application is open on a workspace, **When** the user clicks the "+" button in the tab bar area, **Then** a new untitled file is created and opened in a new tab.
2. **Given** the user has unsaved changes in the current tab, **When** they click the "+" button, **Then** the new file is created without discarding the existing unsaved changes.

---

### User Story 4 - Open the Hamburger Menu (Priority: P2)

A user can click the hamburger menu icon to open a dropdown containing the application's primary actions.

**Why this priority**: The hamburger menu is one of the key visual elements requested; it must be functional and accessible.

**Independent Test**: A user can open the hamburger menu and locate a primary action in under 3 seconds.

**Acceptance Scenarios**:

1. **Given** the application is open, **When** the user clicks the hamburger menu icon, **Then** a dropdown menu appears with the application's primary actions.
2. **Given** the hamburger menu is open, **When** the user clicks outside the menu, **Then** the menu closes.

---

### Edge Cases

- What happens when the window is too narrow to display all tabs? The tab bar should provide a scrolling or overflow mechanism while preserving the + button visibility.
- What happens when no workspace is open? The explorer toggle and + button should still be present but behave sensibly (e.g., + button may be disabled or prompt for a workspace).
- How does the application handle the transition when the explorer is toggled? The layout must animate smoothly without stealing focus from the active editor.
- What if the user has set a custom color theme? The modern grey color palette takes precedence for this feature; custom theme overrides may be considered out of scope.
- What happens to keyboard shortcuts that were previously accessed through the native menu bar? The hamburger menu must expose those actions and the shortcuts must remain functional.
- What happens if the color palette changes are accidentally applied to the document editing surface? The WYSIWYG editor content area must remain visually unchanged; only the main window chrome is affected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application must display a hamburger menu icon in the primary toolbar that opens a dropdown menu containing all existing top-level menu actions (File, Edit, View, Help, and any other application-level menus).
- **FR-002**: The hamburger menu must replace the existing native/application menu bar entirely; the previous menu bar is no longer shown.
- **FR-003**: The tab bar must visually match the rounded corner, modern grey tabbed interface: inactive tabs display truncated text with ellipsis, the active tab is rendered as a light gray pill (`#EAEAEA`) with rounded corners containing an edit icon, the filename label, and a close button, and tabs exhibit distinct active/inactive states, hover states, and close affordance.
- **FR-004**: The new-file action must be triggered by a "+" icon/button placed immediately after the active tab in the tab bar, replacing any existing "New File" text button.
- **FR-005**: A file explorer toggle icon must be placed adjacent to the hamburger menu; clicking it toggles the visibility of the file explorer panel on the left.
- **FR-006**: The main window UI color palette must match the following modern grey reference colors: primary background `#FFFFFF`; secondary/surface background `#F9F9FB`/`#F8F8FA`; active tab pill background `#EAEAEA`; primary text `#1A1A1A`/`#222222`; secondary/muted text `#666666`/`#707070`; borders and dividers `#E5E5E5`/`#ECECEC`; accent orange `#D96B27`; control/button background `#2D2D2D`.
- **FR-007**: The layout state (explorer visible/hidden) must persist across application restarts.
- **FR-008**: When the explorer is hidden, the editor area must expand to use the available width without overlapping or truncating the active document.
- **FR-009**: The hamburger menu, explorer toggle, and + button must be reachable via keyboard interaction (e.g., focusable and activatable with Enter/Space).
- **FR-010**: The WYSIWYG editor content area (the document editing surface) must retain its existing colors and not be restyled by this feature.

### Key Entities *(include if feature involves data)*

- **Layout State**: The persisted visibility state of the file explorer panel (visible/hidden). It represents the user's preferred workspace layout and is restored on application start.
- **Primary Toolbar**: The top-left chrome containing the hamburger menu icon, file explorer toggle icon, and related controls. It is the main entry point for global workspace actions.
- **Tab Bar**: The region containing document tabs and the new-file "+" button. It is the primary navigation surface for open documents.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can identify the hamburger menu, explorer toggle, tab bar, and + button within 5 seconds of opening the application.
- **SC-002**: Users can toggle the explorer panel visibility in under 2 seconds.
- **SC-003**: Users can create a new file from the + button in under 3 seconds.
- **SC-004**: The application's visual appearance is consistent with the rounded corner, modern grey reference as judged by a side-by-side comparison.
- **SC-005**: Layout state (explorer visibility) persists across 100% of clean application restarts.
- **SC-006**: 90% of users can locate a primary action inside the hamburger menu on their first attempt.

## Assumptions

- The modern grey color palette has been provided by the user as exact values: primary background `#FFFFFF`; secondary/surface background `#F9F9FB`/`#F8F8FA`; active tab pill background `#EAEAEA`; primary text `#1A1A1A`/`#222222`; secondary/muted text `#666666`/`#707070`; borders and dividers `#E5E5E5`/`#ECECEC`; accent orange `#D96B27`; control/button background `#2D2D2D`.
- The file explorer panel is positioned on the left side of the application window.
- The tab bar behavior (reordering, closing, scrolling) remains functionally unchanged; only visual styling is updated.
- The + button creates a new untitled file in the current workspace.
- The hamburger menu exposes all existing top-level actions; no new commands are introduced by this feature.
- The existing native/application menu bar is removed and replaced by the hamburger menu.
- The WYSIWYG editor content area (the document editing surface) is out of scope for this feature and retains its existing colors.
- The application will use the Heroicons open-source icon library for the new UI chrome icons: `Bars3` for the hamburger menu, `Squares2x2` for the explorer toggle, `Plus` for the new-file button, `XMark` for tab close, and `PencilSquare` (or `Pencil`) for the active tab edit indicator.
- The active tab is rendered as a light gray pill (`#EAEAEA`) with rounded corners, containing an edit icon, the filename label, and a close button; inactive tab labels truncate with ellipsis when too long.
- The "+" new-file button is placed immediately after the active tab in the tab bar.
- The window uses a clean white canvas background and the top-right controls follow the standard Windows-style minimize/maximize/close layout.
