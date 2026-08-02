# Feature Specification: Help Menu

**Feature Branch**: `007-help-menu`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "This speckit spec is to make a help menu. It should contain one item, a link to the github repository"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visit the project repository (Priority: P1)

A writer can open the project's GitHub repository from the application Help menu
to find documentation, releases, source code, and ways to report issues.

**Why this priority**: The project repository is the requested single support
destination and gives users a reliable path to project information without
searching for it independently.

**Independent Test**: Open the Help menu, activate its repository item, and verify
that the operating system opens the canonical project repository in the user's
default web browser while the application remains open and unchanged.

**Acceptance Scenarios**:

1. **Given** the application is open, **When** the user opens the Help menu,
   **Then** the menu contains exactly one application-provided item labeled
   `GitHub Repository`.
2. **Given** the Help menu is open, **When** the user selects `GitHub Repository`,
   **Then** the operating system opens
   `https://github.com/yetanotherchris/another-markdown-editor` in the default
   web browser.
3. **Given** documents, a workspace, or unsaved edits are open, **When** the user
   selects `GitHub Repository`, **Then** the application session, active document,
   and unsaved-changes state remain unchanged.

---

### Edge Cases

- No default web browser is available or the operating system refuses the external
  link: the application stays open and shows a quiet, actionable error without
  losing document state.
- The application has no open document or workspace: the Help menu and repository
  action remain available.
- Keyboard-only use: the Help menu item is reachable and activatable through the
  platform menu keyboard controls.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST provide a Help menu in its application menu.
- **FR-002**: The Help menu MUST contain exactly one application-provided item,
  labeled `GitHub Repository`.
- **FR-003**: Selecting `GitHub Repository` MUST open the canonical project URL
  `https://github.com/yetanotherchris/another-markdown-editor` with the operating
  system's default external web browser.
- **FR-004**: Activating the repository link MUST NOT navigate the application
  window away from the editor, replace the current workspace, change the active
  document, or alter unsaved-changes state.
- **FR-005**: If the operating system cannot open the repository link, the
  application MUST report the failure in context and preserve the current session.
- **FR-006**: The Help menu and its repository item MUST be reachable with
  platform-standard keyboard menu navigation.

### Key Entities

- **Help menu**: The application-menu section that exposes the project's single
  user-support destination.
- **Canonical project URL**: The authoritative GitHub repository address for this
  project: `https://github.com/yetanotherchris/another-markdown-editor`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of menu tests, the Help menu contains exactly one
  application-provided item labeled `GitHub Repository`.
- **SC-002**: In 100% of link-activation tests, selecting the item requests the
  canonical project URL through the operating system's external-browser handling.
- **SC-003**: In 100% of tests with open, modified documents, activating the
  repository link preserves the active document, workspace, and unsaved-changes
  state.
- **SC-004**: In usability testing, at least 90% of users can find and activate
  the repository link from the application menu within 10 seconds.

## Assumptions

- **Single-item scope**: The Help menu contains only the requested GitHub
  Repository item. About dialogs, documentation viewers, keyboard-shortcut lists,
  update checks, and additional support links are out of scope.
- **External navigation**: The repository opens outside the application in the
  operating system's default browser; an embedded web view is out of scope.
- **Canonical destination**: The Git remote identified the canonical repository
  URL at specification time. Future repository moves require updating this
  canonical destination as part of the move.
