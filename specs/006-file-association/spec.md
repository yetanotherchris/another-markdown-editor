# Feature Specification: File Association

**Feature Branch**: `006-file-association`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "This speckit spec is to make an OS-native context menu item (Windows - use Mac equivalent too) to open files and folders using A.N.E"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a markdown file from the operating system (Priority: P1)

A writer can select a markdown file in their operating system's file browser and
open it directly in the application from a native contextual action.

**Why this priority**: Opening a document from the place where the writer already
found it avoids an extra application launch and file-picker step.

**Independent Test**: Install the application, invoke the operating-system contextual
action for a `.md` file, and verify that the application opens the selected file as a
document without creating a duplicate if it is already open.

**Acceptance Scenarios**:

1. **Given** the application is installed on Windows and a user right-clicks a
   `.md` file, **When** they choose the action bearing the product name, **Then**
   the application launches or becomes active and opens that file for editing.
2. **Given** the application is installed on macOS and a user invokes the
   Finder-equivalent action for a `.md` file, **When** they choose the action
   bearing the product name, **Then** the application launches or becomes active
   and opens that file for editing.
3. **Given** the selected markdown file is already open in the application, **When** the
   user invokes the native action, **Then** its existing tab becomes active rather
   than a duplicate document opening.
4. **Given** a `.markdown` file is selected in a supported file browser, **When**
   the user invokes the native action, **Then** it opens with the same behavior as
   a `.md` file.

---

### User Story 2 - Open a workspace folder from the operating system (Priority: P1)

A writer can select a folder in their operating system's file browser and open
it directly as an application workspace from a native contextual action.

**Why this priority**: Starting from a folder is the fastest way to begin working
with a collection of notes.

**Independent Test**: Install the application, invoke the operating-system contextual
action for a folder, and verify that the selected folder becomes the workspace
and its markdown files appear in the explorer.

**Acceptance Scenarios**:

1. **Given** the application is installed on Windows and a user right-clicks a
   folder, **When** they choose the action bearing the product name, **Then** the
   application launches or becomes active with that folder opened as the
   workspace.
2. **Given** the application is installed on macOS and a user invokes the
   Finder-equivalent action for a folder, **When** they choose the action bearing
   the product name, **Then** the application launches or becomes active with that
   folder opened as the workspace.
3. **Given** another workspace is already open with documents containing unsaved
   changes, **When** the user invokes the native action for a folder, **Then**
   existing confirmation behavior is applied before the current workspace is
   replaced.
4. **Given** the user cancels the required unsaved-work confirmation, **When**
   the native folder action ends, **Then** the existing workspace and documents
   remain unchanged.

---

### User Story 3 - Recognize safe, native integration (Priority: P2)

A writer can identify the application's action in the operating system's familiar file
browser interface without the installation changing their preferred default app.

**Why this priority**: The integration must be discoverable and convenient while
respecting existing user choices for files and folders.

**Independent Test**: Inspect supported file and folder context menus after
installation and verify the application action is identifiable, then confirm that an
unrelated existing default application remains unchanged.

**Acceptance Scenarios**:

1. **Given** the application is installed, **When** a user views a supported file
   or folder's native context menu, **Then** the action displays the configured
   product name within a clear platform-conventional open command.
2. **Given** another application is the user's default application for markdown
   files, **When** the application is installed, **Then** that default remains
   unchanged.
3. **Given** the user uninstalls the application, **When** they view native
   context menus, **Then** its action is removed and no broken menu entry remains.

---

### Edge Cases

- The operating system provides a file path that no longer exists or cannot be
  read: the application reports a clear in-context error and does not open a blank or
  misleading document.
- The operating system provides a folder path that no longer exists, cannot be
  read, or resolves outside a permitted workspace boundary through a link: the application
  refuses it safely and leaves the existing session unchanged.
- An unsupported file type is selected: the application context action is not offered
  for that file type and the application does not attempt to open it as markdown.
- A file or folder path contains spaces, non-Latin characters, or reserved-looking
  characters: the selected item is opened exactly as chosen, without path
  truncation or reinterpretation.
- The application is already running with an unsaved document: opening a file or
  folder through the native action preserves existing unsaved-work confirmation
  behavior wherever the action would discard or replace work.
- Multiple files or folders are selected: the native action is available only
  when the operating system can unambiguously invoke the application for one selected
  supported item.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Installed Windows versions of the application MUST provide a native
  file-browser context-menu action containing the configured product name for
  `.md` and `.markdown` files.
- **FR-002**: Installed Windows versions of the application MUST provide the same native
  context-menu action for folders.
- **FR-003**: Installed macOS versions of the application MUST provide a Finder-native or
  Finder-conventional equivalent action for `.md` and `.markdown` files.
- **FR-004**: Installed macOS versions of the application MUST provide a Finder-native or
  Finder-conventional equivalent action for folders.
- **FR-005**: Invoking the application operating-system action for a supported markdown
  file MUST open that file using the existing single-file open behavior.
- **FR-006**: Invoking the application operating-system action for a folder MUST open
  it using the existing workspace-open behavior.
- **FR-007**: When the selected file is already open, the system MUST activate its
  existing document tab rather than create a duplicate.
- **FR-008**: When the action is invoked while the application is already running, the
  application MUST receive and process the selected item rather than silently
  ignoring the request or starting an unusable duplicate session.
- **FR-009**: Operating-system action invocations MUST preserve existing
  unsaved-work safeguards before replacing a workspace or otherwise discarding
  user changes.
- **FR-010**: The system MUST treat every file or folder path received from the
  operating system as untrusted and validate it before reading from or using it.
- **FR-011**: If an operating-system-supplied item is unavailable, unreadable,
  unsupported, or fails validation, the system MUST fail closed, leave the current
  session unchanged, and show a clear error that does not expose unrelated
  filesystem locations.
- **FR-012**: Installing the application MUST NOT change the user's existing default
  application for markdown files or folders without explicit user action.
- **FR-013**: Uninstalling the application MUST remove its native file-browser actions
  without removing or corrupting unrelated file associations.
- **FR-014**: The native actions MUST be available only for one selected supported
  file or folder at a time; multi-selection is out of scope for this feature.
- **FR-015**: The application MUST define its product display name once as a
  product-level value, and every native file-browser action in this feature MUST
  derive its visible product-name text from that value.

### Key Entities

- **Product display name**: The single product-level value used wherever the
  application identifies itself to the operating system and the user.
- **Native open action**: The operating-system file-browser command that routes a
  selected supported file or folder to the application using the product display
  name.
- **Supported file**: A markdown document with a `.md` or `.markdown` extension.
- **Workspace invocation**: A native open action whose selected item is a folder,
  causing that folder to be considered as the requested workspace.
- **External path**: A file or folder location received from the operating system
  rather than selected inside the application; it is untrusted until validated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of supported Windows installation tests, the action labeled
  with the configured product name appears for `.md`, `.markdown`, and folder
  context menus and opens the selected item correctly.
- **SC-002**: In 100% of supported macOS installation tests, the Finder-equivalent
  action labeled with the configured product name is available for `.md`,
  `.markdown`, and folders and opens the selected item correctly.
- **SC-003**: In 100% of repeated-open tests, invoking the native action for an
  already open file activates its existing tab without increasing the number of
  open documents.
- **SC-004**: In 100% of adversarial external-path tests, invalid, unavailable,
  or unsafe paths are refused without changing the current session or exposing an
  unrelated filesystem location.
- **SC-005**: In 100% of workspace replacement tests with unsaved changes, native
  folder opening presents the existing confirmation and respects cancellation.
- **SC-006**: In usability testing, at least 90% of users can find the action
  bearing the configured product name for a supported file or folder and open it
  within 15 seconds.

## Assumptions

- **Platform scope**: The requested native integration applies to Windows and
  macOS. A Linux desktop-file-manager equivalent is out of scope for this feature.
- **File scope**: Only the application's supported markdown extensions, `.md` and
  `.markdown`, receive a file context action. Folders always receive the folder
  action because they can be opened as workspaces.
- **Naming**: `markdownmeister` is the product name used by all native actions
  (spec 019). The implementation plan will define a single product-name
  constant whose current value is used by all native actions; platform-specific
  conventions may add a standard surrounding label such as "Open with".
- **Default associations**: The feature adds an explicit context action and does
  not register the application as the default handler for files or folders.
- **Invocation scope**: One selected item per action is supported. Batch opening,
  Finder/Explorer badges, and context actions for unsupported file types are out
  of scope.
