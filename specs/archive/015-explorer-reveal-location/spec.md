# Feature Specification: Explorer Reveal Location

**Feature Branch**: `[015-explorer-reveal-location]`

**Created**: 2026-08-05

**Status**: Archived

**Input**: User description: "A new explorer context menu item - open file (or folder) location. This opens explorer or the OS-equivalent for the file/folder location."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reveal a File's Location (Priority: P1)

A user can right-click a markdown file in the workspace explorer and open its containing folder in the operating system's file manager. The file is selected or highlighted if the OS supports it.

**Why this priority**: Writers often need to locate a file on disk for backup, sharing, or external editing; this action removes the need to manually navigate the folder structure.

**Independent Test**: Right-click a file in the explorer, choose the reveal action, and verify the OS file manager opens at the file's parent folder with the file selected or highlighted.

**Acceptance Scenarios**:

1. **Given** a markdown file is visible in the workspace explorer, **When** the user opens its context menu and selects the reveal action, **Then** the OS file manager opens showing the file's parent folder.
2. **Given** the OS file manager supports selecting a specific file, **When** the reveal action is used for a file, **Then** the file is selected or highlighted in the opened folder.
3. **Given** the file is inside a nested folder, **When** the user selects the reveal action, **Then** the file manager opens the correct nested folder, not the workspace root.

---

### User Story 2 - Reveal a Folder's Location (Priority: P1)

A user can right-click a folder in the workspace explorer and open that folder in the operating system's file manager.

**Why this priority**: Folders are also workspace items; the same external-navigation need applies to them.

**Independent Test**: Right-click a folder in the explorer, choose the reveal action, and verify the OS file manager opens at that folder.

**Acceptance Scenarios**:

1. **Given** a folder is visible in the workspace explorer, **When** the user opens its context menu and selects the reveal action, **Then** the OS file manager opens showing that folder.
2. **Given** the folder is nested inside another folder, **When** the user selects the reveal action, **Then** the file manager opens the correct nested folder.

---

### User Story 3 - Discover the Reveal Action Easily (Priority: P2)

A user can find the reveal action in the explorer context menu without hunting for it.

**Why this priority**: The action is only useful if users can locate it; it should follow the conventions of the OS and the rest of the application's context menus.

**Independent Test**: A user can locate the reveal action in the context menu within 3 seconds of right-clicking an item.

**Acceptance Scenarios**:

1. **Given** a file or folder is right-clicked in the explorer, **When** the context menu appears, **Then** the reveal action is clearly labeled (e.g., "Open file location", "Open folder location", or "Reveal in Explorer/Finder").
2. **Given** the context menu is open, **When** the user reads the reveal action label, **Then** they can tell whether it applies to a file or a folder.

---

### User Story 4 - Handle Errors Gracefully (Priority: P2)

A user receives a clear, quiet message if the file or folder location cannot be opened, without losing their current editing session.

**Why this priority**: Files or folders may be moved or deleted outside the application; the action should fail safely and informatively.

**Independent Test**: Select the reveal action for a file that has been deleted externally and verify the application shows an error without disturbing the current workspace or document.

**Acceptance Scenarios**:

1. **Given** the target file or folder no longer exists, **When** the user selects the reveal action, **Then** the application explains that the location cannot be opened and leaves the current session unchanged.
2. **Given** the OS file manager cannot be launched, **When** the user selects the reveal action, **Then** the application explains the failure and leaves the current session unchanged.

---

### Edge Cases

- What happens when the item's path contains non-Latin characters or spaces? The path is passed correctly to the OS file manager.
- What happens when the path is very long? The reveal action still opens the correct folder; the OS may shorten the displayed path.
- What happens when the workspace root is revealed? The OS file manager opens at the workspace root folder.
- What happens when the user reveals a file inside a collapsed folder? The action works regardless of the folder's expanded state in the explorer.
- What happens when multiple items are selected? The context menu is based on the single item under the cursor; this feature does not add multi-item reveal.
- What happens when the path is outside the workspace root? The action is only offered for items within the workspace root; any path is validated against the root before the OS is asked to open it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The workspace explorer context menu for a markdown file MUST provide an action that opens the file's parent folder in the OS file manager.
- **FR-002**: The workspace explorer context menu for a folder MUST provide an action that opens the folder in the OS file manager.
- **FR-003**: The reveal action label MUST clearly indicate what it does (e.g., "Open file location", "Open folder location", or "Reveal in Explorer/Finder").
- **FR-004**: For files, the OS file manager SHOULD select or highlight the file when the platform supports it.
- **FR-005**: The target path MUST be validated against the workspace root before the OS file manager is launched, following the same security rules as other file operations.
- **FR-006**: If the target path is invalid, outside the workspace root, or the file manager cannot be opened, the application MUST show a quiet, in-context error and MUST NOT alter the current document or workspace.
- **FR-007**: The reveal action MUST be available for files and folders at any depth within the workspace root.
- **FR-008**: The reveal action MUST NOT be offered for items that are outside the workspace root or that fail path validation.

### Key Entities *(include if feature involves data)*

- **Revealed Item**: A workspace file or folder selected in the explorer for which the user wants to open the OS file manager.
- **Workspace Root**: The resolved real path of the currently opened folder, used to validate that the revealed item's path lies within the workspace.
- **OS File Manager**: The platform's default file manager (Explorer on Windows, Finder on macOS, or equivalent on Linux).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can open a file's location in the OS file manager in under 3 seconds.
- **SC-002**: A user can open a folder's location in the OS file manager in under 3 seconds.
- **SC-003**: In 100% of successful tests, the OS file manager opens at the correct folder.
- **SC-004**: In 100% of tests on platforms that support file selection, the file is selected or highlighted in the opened folder.
- **SC-005**: In 100% of tests with an invalid or unavailable path, the application shows an error and leaves the current session unchanged.

## Assumptions

- The action opens the OS default file manager; selecting a custom file manager is out of scope.
- The action is available only for items within the resolved workspace root, with the same path-containment validation used by other file operations.
- The action is read-only and does not move, copy, or delete any files.
- The action applies to single items only; multi-item reveal is out of scope.
- The label is adapted to the operating system where appropriate (e.g., "Reveal in Explorer" on Windows, "Reveal in Finder" on macOS).
