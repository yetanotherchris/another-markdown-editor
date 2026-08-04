# Feature Specification: Recent Items

**Feature Branch**: `004-recent-items`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "This speckit spec is to make a recent items menu in the file menu. Recent items should be stored in a JSON config file: ~/.config/ame/config.json or if that's not standard, somewhere in the home directory. It should include files (if opened via file menu) and folders"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reopen recent files and folders (Priority: P1)

A writer can use the File menu to reopen a document previously opened through the
File menu or reopen a folder previously opened as a workspace.

**Why this priority**: Recent items eliminate repeated navigation through file
pickers when returning to the writer's current documents and workspaces.

**Independent Test**: Open a file through the File menu and a folder as a
workspace, restart the application, then reopen each from Recent Items and verify
that it restores the expected document or workspace.

**Acceptance Scenarios**:

1. **Given** a markdown file was successfully opened through the File menu,
   **When** the user opens File > Recent Items, **Then** that file is listed and
   can be opened directly.
2. **Given** a folder was successfully opened as a workspace, **When** the user
   opens File > Recent Items, **Then** that folder is listed and can be reopened
   directly as the workspace.
3. **Given** a file or folder has been reopened from Recent Items, **When** the
   user views the menu, **Then** that item appears as the most recently used
   entry without a duplicate entry for the same location and type.
4. **Given** the application has been closed and started again, **When** the user
   opens File > Recent Items, **Then** previously stored recent entries are still
   available.

---

### User Story 2 - Distinguish recent item types (Priority: P2)

A writer can tell whether a recent entry will open a single document or a
workspace folder before selecting it.

**Why this priority**: File and folder entries have different effects on the
current editing session, so the menu must make their type clear.

**Independent Test**: Populate Recent Items with one file and one folder, then
verify that each entry visibly identifies its type and performs its corresponding
open action.

**Acceptance Scenarios**:

1. **Given** Recent Items includes both files and folders, **When** the user
   views an entry, **Then** the folders-above-files grouping and the entry's
   name let them tell a file from a folder before selecting it.
2. **Given** the user selects a recent file, **When** it opens successfully,
   **Then** it follows the existing single-file open behavior.
3. **Given** the user selects a recent folder, **When** it opens successfully,
   **Then** it follows the existing workspace-open behavior.

---

### User Story 3 - Recover gracefully from unavailable entries (Priority: P2)

A writer selecting an entry that was moved, deleted, or is no longer accessible
receives a clear explanation without losing current work or being repeatedly
offered a dead entry.

**Why this priority**: Recent locations can become invalid outside the
application; handling that calmly preserves trust and prevents menu clutter.

**Independent Test**: Add a file and a folder to Recent Items, make each
unavailable outside the application, select it from the menu, and verify the
current session remains intact and the unavailable entry is removed.

**Acceptance Scenarios**:

1. **Given** a recent file no longer exists or cannot be read, **When** the user
   selects it, **Then** the system explains that it cannot be opened, leaves the
   current document session unchanged, and removes the unavailable entry from
   Recent Items.
2. **Given** a recent folder no longer exists or cannot be opened, **When** the
   user selects it, **Then** the system explains that it cannot be opened, leaves
   the current workspace and document session unchanged, and removes the
   unavailable entry from Recent Items.
3. **Given** a recent folder can be opened but replacing the current workspace
   would require existing unsaved-work confirmation, **When** the user cancels
   that confirmation, **Then** the current session remains intact and the recent
   folder stays in Recent Items.

---

### User Story 4 - Clear recent items (Priority: P2)

A writer can remove the entire recent-items history in one action instead of
clearing entries one at a time or editing the config file by hand.

**Why this priority**: A stale or privacy-sensitive history should be erasable
without the user editing the config file directly.

**Independent Test**: Record a file and a folder, invoke Clear Recent Items, and
verify the menu reverts to the empty "no recent items" state while the open
document session is unchanged.

**Acceptance Scenarios**:

1. **Given** Recent Items contains at least one entry, **When** the user
   invokes Clear Recent Items, **Then** all entries are removed and the menu
   shows the disabled "No Recent Items" state.
2. **Given** the user invokes Clear Recent Items, **When** the clearing
   completes, **Then** the currently open documents and workspace are unchanged.
3. **Given** the user has cleared Recent Items, **When** the application is
   restarted, **Then** the history remains empty.

---

### Edge Cases

- No qualifying file or folder has been opened: File > Recent Items clearly
  indicates that there are no recent items and has no selectable stale action.
- A stored recent entry is malformed, duplicated, or not a supported markdown
  file or folder: it is ignored safely and does not prevent the application from
  starting or other valid entries from appearing.
- The recent-items configuration is missing, inaccessible, or invalid: the
  application starts normally with an empty recent-items list and reports a
  persistence problem in a quiet, actionable way when appropriate.
- A file is opened from the workspace explorer rather than through the File menu:
  it does not enter the file portion of Recent Items.
- More than 5 files or more than 5 folders are opened: only the 5 most recent
  entries of each type remain, and entries of the other type are unaffected.
- A file or folder path contains non-Latin characters, whitespace, or a path that
  is long enough to require visual shortening: the entry remains unambiguous and
  selectable.
- Only folders or only files are recorded: the absent group is simply omitted
  (no empty section, no dangling separator).
- The user invokes Clear Recent Items with entries present: the list is emptied
  and the menu reverts to the "no recent items" state. With an empty list no
  Clear action is offered.
- Clearing Recent Items is a menu action that must not disturb the open
  document/workspace session; a persistence failure while clearing is reported
  quietly and is non-fatal.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The File menu MUST provide a Recent Items menu containing recently
  opened qualifying files and folders.
- **FR-002**: The system MUST add a markdown file to Recent Items only after it
  is successfully opened through the File menu.
- **FR-003**: The system MUST add a folder to Recent Items only after it is
  successfully opened as a workspace.
- **FR-004**: The system MUST persist recent items in a per-user JSON
  configuration file. On platforms that use the conventional `~/.config`
  directory, the file MUST be located at `~/.config/ame/config.json`; on other
  platforms, it MUST use the platform's conventional per-user configuration
  location under the user's home directory.
- **FR-005**: Recent items MUST remain available after the application is closed
  and restarted, provided their configuration and target locations remain
  available.
- **FR-006**: The system MUST order recent items by most recent successful open
  and keep only one entry for each location and item type.
- **FR-007**: Selecting a recent file MUST use the existing single-file opening
  behavior; selecting a recent folder MUST use the existing workspace-opening
  behavior.
- **FR-008**: Each Recent Items entry MUST make its file or folder type clear
  before selection. The folders-above-files grouping (FR-015) conveys the type —
  folder entries are listed first as a group, then file entries — and the entry
  name (a folder's directory name vs a `.md`/`.markdown` filename) reinforces
  it. Entries are NOT prefixed with `File:`/`Folder:` (see the 2026-08-04
  clarification).
- **FR-009**: When a recent item cannot be opened because its target is missing,
  unreadable, unsupported, or no longer valid, the system MUST leave the current
  session unchanged, explain the failure in context, and remove that entry from
  Recent Items.
- **FR-010**: Opening a recent folder MUST preserve existing safeguards for
  unsaved work; if the user cancels a required confirmation, the current session
  and the recent entry MUST remain unchanged.
- **FR-011**: The system MUST tolerate a missing, unreadable, or malformed
  recent-items configuration without preventing application startup or access to
  File menu actions.
- **FR-012**: The system MUST limit Recent Items to at most 5 files and at most
  5 folders, removing the least-recent entry of that type when a new qualifying
  entry of the same type exceeds the limit.
- **FR-013**: The system MUST NOT add files opened only through the workspace
  explorer to Recent Items unless they were also successfully opened through the
  File menu.
- **FR-014**: The File menu MUST provide a **Clear Recent Items** action, at the
  bottom of the Recent Items submenu after a separator, that removes all recent
  files and folders when invoked.
- **FR-015**: Within Recent Items, folder entries MUST be listed first (most
  recent first), followed by a separator, then file entries (most recent first);
  a final separator precedes the Clear Recent Items action.

### Key Entities

- **Recent item**: A persisted reference to a successfully opened markdown file
  or workspace folder, including its location, type, and most recent successful
  opening order.
- **Recent-items configuration**: The per-user JSON configuration file holding
  the recent-item list, stored in the platform-appropriate configuration location.
- **Recent Items menu**: The File menu section that presents persisted recent
  files and folders and opens the selected entry using its matching behavior.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability testing, at least 90% of users can reopen a recently
  opened file or folder from the File menu within 10 seconds without using a file
  picker.
- **SC-002**: In 100% of persistence tests, a successfully opened qualifying
  file or folder remains available in Recent Items after application restart.
- **SC-003**: In 100% of ordering tests, reopening an existing entry moves it to
  the first position within its group without creating a duplicate, and the list
  never exceeds 5 entries of each type.
- **SC-004**: In 100% of unavailable-entry tests, selecting a missing or
  unreadable item preserves the current session and removes the unusable entry.
- **SC-005**: In 100% of malformed-configuration tests, the application starts
  and the File menu remains usable.
- **SC-006**: In 100% of type-identification tests, users can distinguish recent
  files from recent folders before opening an entry.

## Assumptions

- **Qualifying files**: The requested file history includes only markdown files
  successfully opened through the File menu. Opening a file from the workspace
  explorer does not add it to Recent Items.
- **Qualifying folders**: Every folder successfully opened as a workspace is a
  qualifying recent folder, whether opened from the standard folder action or a
  future equivalent File menu action.
- **List size**: A 5-per-type cap (5 files, 5 folders) is the reasonable default
  for a compact File menu. The cap applies independently to each type, so the
  combined list never exceeds 10 entries.
- **Grouping**: Folder entries always appear above file entries regardless of
  recency; recency orders entries within each group. Sections that have no
  entries are omitted entirely (including their separators).
- **Clear action**: The Clear Recent Items action is offered only when the list
  is non-empty (an empty list already shows the disabled "No Recent Items"
  entry). Clearing is a main-process menu action and never touches the open
  document/workspace session.
- **Unavailable entries**: An item is removed only after an attempted open proves
  it unavailable or invalid. Cancelling an unsaved-work confirmation is not a
  failed open and preserves the entry.
- **Configuration ownership**: Recent-items data is local to the operating-system
  user, is not synchronized or shared, and contains no document contents.
- **Out of scope**: Pinning recent entries, cross-device sync, automatic
  reopening on startup, and history for files opened solely from the workspace
  explorer are not included.

## Clarifications

- 2026-08-03 — List cap is per type (max 5 files, max 5 folders) rather than a
  combined 10; folders are grouped above files with a separator; a **Clear
  Recent Items** action sits at the bottom of the submenu (FR-012/014/015).
  These supersede the earlier combined-10 phrasing.
- 2026-08-04 — Recent Items menu labels carry NO `File:`/`Folder:` prefix. The
  type is inferred from the item: folder entries are grouped above file entries
  (FR-015) and a folder entry is a directory name while a file entry ends in
  `.md`/`.markdown`. This supersedes any earlier per-label type-tag wording in
  FR-008/US2 (SC-006 still requires the type to be identifiable before
  selection).
- 2026-08-04 — The folder-open unsaved-work confirmation (FR-010/US3 scenario
  3) applies to **workspace-relative documents with unsaved changes** only.
  Documents whose paths are absolute (opened from outside the workspace) are
  not affected by a workspace swap and do not trigger the confirmation.
- 2026-08-04 — "A stored recent entry … is not a supported markdown file … it
  is ignored safely" means **structurally tolerated**: entries are validated on
  load for shape (absolute path, known kind, name, finite timestamp) but NOT for
  a `.md`/`.markdown` extension. A hand-edited non-markdown `file` entry is
  still listed and is dropped only if (and when) an open attempt fails. It never
  prevents startup or hides valid entries.
