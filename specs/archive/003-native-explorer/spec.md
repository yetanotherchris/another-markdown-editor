# Feature Specification: Native Explorer

**Feature Branch**: `003-native-explorer`

**Created**: 2026-08-02

**Status**: Archived

**Input**: User description: "This speckit spec is to make the treeview appear more OS-native. Currently it has small arrows and unusual icons. It should pick a free iconpack to make the tree look more appealing. The font should also be a free font (but as a downloaded font rather than loaded over the network). Something similar to Obsidian or OpenCode's font - sans serif. Similar to Inter. The \"new\" and \"open Folder\" buttons should use icons. The currently open file should appear in a footer rather than the header, in the bottom left. the Currently open folder should appear in the footer, on the right hand side, using the full path, or if necessary, a shortened version of the path with the final folder visible."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Navigate a familiar-looking workspace (Priority: P1)

A writer browsing a workspace can distinguish folders, files, and expand/collapse
controls at a glance because the explorer uses a cohesive, familiar desktop
visual language.

**Why this priority**: The explorer is a primary navigation surface. Clear,
recognizable visual cues make a folder of notes faster and more pleasant to use.

**Independent Test**: Open a workspace containing nested folders and markdown
files, expand and collapse folders, and verify that folders, files, and hierarchy
controls are visually distinct and recognizable.

**Acceptance Scenarios**:

1. **Given** a workspace with folders and markdown files is open, **When** the
   user views the explorer, **Then** folders, files, and hierarchy controls use a
   consistent and readily recognizable visual language.
2. **Given** a folder is collapsed, **When** the user views its hierarchy control,
   **Then** its affordance clearly communicates that the folder can be expanded.
3. **Given** a folder is expanded, **When** the user views its hierarchy control,
   **Then** its affordance clearly communicates that the folder can be collapsed.

---

### User Story 2 - Use explorer actions without text-heavy controls (Priority: P2)

A writer can recognize the actions to create an item and open a folder from
compact explorer controls that use meaningful icons and remain understandable.

**Why this priority**: Icon-based actions reduce visual clutter while preserving
quick access to frequent workspace actions.

**Independent Test**: View the explorer's primary controls and use the create and
open-folder actions by their icons, confirming that each action is identified
before activation.

**Acceptance Scenarios**:

1. **Given** the explorer is visible, **When** the user views the control for
   creating a new item, **Then** it uses a recognizable create icon and has an
   accessible text label or explanatory tooltip.
2. **Given** the explorer is visible, **When** the user views the control for
   opening a folder, **Then** it uses a recognizable open-folder icon and has an
   accessible text label or explanatory tooltip.
3. **Given** keyboard navigation is used, **When** either icon control receives
   focus, **Then** its purpose is available without relying only on its visual
   icon.

---

### User Story 3 - See current document and workspace at a glance (Priority: P1)

A writer can identify the active document and workspace from a persistent footer,
leaving the header free of the current-file display.

**Why this priority**: The document and workspace context must stay visible while
the explorer and editor are used, but it should not compete with primary controls
at the top of the interface.

**Independent Test**: Open a workspace and a document, switch tabs, and verify
that the footer's left side identifies the active file while its right side
identifies the workspace location.

**Acceptance Scenarios**:

1. **Given** an open document is active, **When** the user views the bottom-left
   footer, **Then** it identifies the currently open file.
2. **Given** a workspace is open, **When** the user views the bottom-right footer,
   **Then** it displays the workspace's full location when space permits.
3. **Given** the workspace location does not fit in the footer, **When** the user
   views the bottom-right footer, **Then** it uses an unambiguous shortened form
   that keeps the final folder name visible.
4. **Given** the user switches to another open document, **When** the tab becomes
   active, **Then** the bottom-left footer updates to identify that document.
5. **Given** a document is open, **When** the user views the header, **Then** the
   active-file display is not duplicated there.

---

### User Story 4 - Read the interface comfortably offline (Priority: P2)

A writer sees a clean, modern sans-serif typeface and coherent icons even when
the application has no network connection.

**Why this priority**: The desktop application's appearance and readability must
not depend on remote services or change unexpectedly with connectivity.

**Independent Test**: Launch the application with network access unavailable and
verify the explorer typography and all requested icons render as designed.

**Acceptance Scenarios**:

1. **Given** the application starts without network access, **When** the user
   opens a workspace, **Then** the interface uses the selected modern sans-serif
   typeface rather than falling back because a remote font is unavailable.
2. **Given** the application starts without network access, **When** the user
   views the explorer and its primary controls, **Then** the requested icons are
   displayed normally.

---

### Edge Cases

- No workspace is open: the workspace portion of the footer clearly indicates
  that no folder is open and does not show a stale location.
- No document is open or the active document has never been saved: the file
  portion of the footer uses the document's existing display title and does not
  show a stale file name.
- The workspace path is too long for the available footer width: shortening keeps
  the final folder visible and does not cause the footer to overlap controls or
  content.
- A file or folder name includes non-Latin characters or an exceptionally long
  name: the explorer remains readable, and identifying visual controls remain
  aligned and usable.
- High-contrast, keyboard-only, or screen-reader use: icon-only controls retain
  an accessible name and focus indication, and visual changes do not make the
  explorer unusable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The explorer MUST use a single cohesive, freely distributable icon
  set for its folders, files, hierarchy controls, and requested action controls.
- **FR-002**: The explorer MUST use visually recognizable, desktop-familiar
  folder and file icons that clearly distinguish those item types.
- **FR-003**: The explorer MUST use clear expand and collapse affordances in place
  of visually ambiguous or unusually small hierarchy indicators.
- **FR-004**: The create-new-item explorer control MUST use a meaningful icon and
  expose an accessible text name or explanatory tooltip.
- **FR-005**: The open-folder explorer control MUST use a meaningful icon and
  expose an accessible text name or explanatory tooltip.
- **FR-006**: The application MUST use a freely distributable modern sans-serif
  typeface with a clean desktop-editor appearance.
- **FR-007**: The selected typeface and icons MUST be available from the installed
  application and MUST NOT require a network request to display.
- **FR-008**: The interface MUST provide a persistent footer with distinct left
  and right regions for document and workspace context.
- **FR-009**: The footer's bottom-left region MUST identify the active document
  using its display name and update whenever the active document changes.
- **FR-010**: The footer's bottom-right region MUST display the open workspace
  location in full when it fits; when it does not fit, it MUST shorten the path
  unambiguously while retaining the final folder name.
- **FR-011**: The active document's file identity MUST no longer be displayed in
  the header when the footer is available.
- **FR-012**: The footer MUST update or clear its document and workspace context
  promptly when a document or workspace is opened, closed, replaced, renamed, or
  made unavailable.
- **FR-013**: Visual updates in this feature MUST preserve keyboard access,
  visible focus indication, and accessible names for interactive controls.

### Key Entities

- **Explorer visual language**: The coordinated typeface, iconography, hierarchy
  controls, spacing, and visual distinctions used to navigate workspace items.
- **Status footer**: The persistent bottom-of-window context area, with a
  left-aligned active-document identity and a right-aligned workspace location.
- **Workspace location display**: The full or shortened user-visible path that
  identifies the currently open folder while retaining its final folder name.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability testing, at least 90% of users correctly identify a
  folder, a file, and the expand control in the explorer on their first attempt.
- **SC-002**: In usability testing, at least 90% of users identify the create and
  open-folder actions from their controls without activating the wrong action.
- **SC-003**: In 100% of automated document-tab tests, the footer's left region
  identifies the active document within 250 milliseconds of a tab switch.
- **SC-004**: In 100% of automated workspace tests, the footer's right region
  shows either the complete workspace location or a shortened location containing
  the final folder name, without overlap or clipping of other footer content.
- **SC-005**: In 100% of offline launch tests, the selected interface typeface and
  all explorer and primary-action icons are visible without network access.
- **SC-006**: In 100% of keyboard-accessibility tests, icon-based explorer actions
  expose an accessible name and a visible focus state.

## Assumptions

- **Visual direction**: The target is a restrained, modern, desktop-native
  aesthetic inspired by familiar note-taking and developer tools, not a literal
  reproduction of another product's branding or design.
- **Asset choice**: The specific freely distributable icon set and typeface will
  be selected during planning after checking their distribution licence and fit
  with the application; no network-hosted font or icon service is acceptable.
- **Footer scope**: The footer presents context only. It does not add a path
  picker, recent-workspace list, or document-management controls.
- **Path shortening**: Shortening is visual only and never changes the workspace
  path or filesystem behaviour. The final workspace folder name remains visible.
- **Existing behavior**: The feature changes presentation and context placement,
  not workspace access, file operations, explorer selection, or document tab
  behavior.
