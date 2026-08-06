# Feature Specification: Desktop Markdown Editor

**Feature Branch**: retired — phases merged directly into `main` (PR #8); see AGENTS.md

**Created**: 2026-08-01

**Status**: Archived

**Input**: User description: "Desktop markdown editor: native File menu (Open File, Open Folder, Save, Save As), WYSIWYG editing, sidebar file explorer to browse a folder, open files in tabs, rename/delete/move files and folders, save to disk, resizable sidebar|editor. Prior decisions: docs/DESIGN_DECISIONS.md"

## Clarifications

### Session 2026-08-01

- Q: Which files should the sidebar explorer list? → A: Markdown files and
  folders only. Non-markdown files are hidden from the tree, and consequently
  cannot be renamed, moved, or deleted from within the application.
- Q: Should deleting a file or folder be recoverable? → A: Deletion sends items
  to the operating system's recycle bin or trash where one is available, after
  confirmation. Where no trash facility exists, the user is told the deletion is
  permanent before it proceeds.
- Q: How should the application react when a file open in the editor is changed
  on disk by another program? → A: Watch open files for external changes.
  Reload automatically when the document has no unsaved changes; prompt the user
  to keep their version or load the external one when it does. The application's
  own writes must not trigger this.

### Session 2026-08-02 (Phase 6 implementation)

- Q: May a user delete a file or folder that backs a document with unsaved
  changes? → A: No — the delete is refused with an explanation naming the
  affected documents (Principle III). The user must save or close them first.
  A delete that affects only clean open documents closes their tabs.
- Q: May a file be renamed to a non-markdown name? → A: No — files renamed
  from the tree must keep the `.md` or `.markdown` extension, because FR-010
  hides other extensions and the renamed file would silently vanish from the
  tree. Folders are unrestricted. The rule is enforced in the main process as
  well as in the renderer.
- Q: What happens when the user cancels the inline naming of a just-created
  file or folder? → A: The empty placeholder is removed (to the trash) without
  a further confirmation — the user's cancel is the confirmation, and the
  placeholder holds no content. If the removal fails, the user is told the
  placeholder is still on disk and can retry via the normal confirmed delete.
- Q: May a rename change only the letter case of a name (`alpha.md` →
  `Alpha.md`)? → A: Yes — on case-insensitive filesystems (Windows, macOS
  default) the target is the same file, so it must not be refused as a
  conflict.
- Q: What editor chrome does the document view have? → A: A persistent menu
  bar (headings and formatting buttons) at the top of the editor replaces the
  floating selection toolbar and the per-line block-edit handle. Satisfies
  FR-011/FR-012 without the transient popups.
- Q: What happens when the user tries to move a folder into its own
  descendant? → A: The move is refused silently — the drop does not land and
  nothing is moved. (Spec scenario 6 below is reworded to match: the original
  "with an explanation" would require a toast; the silent refusal is
  deliberate and e2e-asserted.)
- Q: Do confirmation dialogs stay active while a delete is in flight? → A: No
  — while the trash operation runs, the dialog's buttons are disabled and
  Escape is ignored, so a double-click cannot fire a second delete and Escape
  cannot close the dialog while the delete still executes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Write and save a markdown document (Priority: P1)

A writer opens a markdown file, edits it as formatted text rather than raw
markup, and saves it back to disk. Headings look like headings, bold text looks
bold, and lists look like lists while they are being edited.

**Why this priority**: This is the product. Without it there is no editor. Every
other story exists to make this one more convenient.

**Independent Test**: Open a single `.md` file from the File menu, make an edit,
save, and confirm the file on disk contains the expected markdown. Delivers a
usable single-file editor with no explorer and no tabs.

**Acceptance Scenarios**:

1. **Given** no file is open, **When** the user chooses Open File and picks a
   markdown file, **Then** its content is displayed as formatted text and the
   window identifies the open file.
2. **Given** a file is open and unmodified, **When** the user types into the
   document, **Then** the document is marked as having unsaved changes.
3. **Given** a document with unsaved changes, **When** the user chooses Save,
   **Then** the changes are written to the original file and the unsaved-changes
   indicator clears.
4. **Given** a document with unsaved changes, **When** the user chooses Save As
   and picks a new location, **Then** the content is written there and the
   document is now associated with the new location.
5. **Given** a document is open, **When** the user applies formatting such as a
   heading, bold, a list, a table, or a code block, **Then** the formatting is
   visible immediately and is written as valid markdown on save.
6. **Given** a file was opened and saved with no edits made, **When** the file on
   disk is compared to its original content, **Then** it is unchanged.

---

### User Story 2 - Browse a folder and open files from it (Priority: P2)

A writer points the application at a folder of notes and navigates its structure
in a sidebar, opening files by selecting them.

**Why this priority**: Turns a single-file editor into a tool for working on a
body of documents. Depends on P1 to be useful.

**Independent Test**: Open a folder, expand subfolders, select a file, and
confirm it opens for editing. Delivers folder-based browsing on top of P1.

**Acceptance Scenarios**:

1. **Given** no folder is open, **When** the user chooses Open Folder and picks a
   folder, **Then** the sidebar shows that folder's contents as a tree.
2. **Given** a folder tree is displayed, **When** the user expands a subfolder,
   **Then** its children are shown.
3. **Given** a folder tree is displayed, **When** the user selects a markdown
   file, **Then** it opens for editing.
4. **Given** a folder is open, **When** the user resizes the divider between the
   sidebar and the editor, **Then** the split adjusts and the chosen width
   persists across restarts.

---

### User Story 3 - Work on several documents at once (Priority: P2)

A writer keeps multiple documents open and switches between them without losing
their place in any of them.

**Why this priority**: Cross-referencing between notes is a core writing
activity. Equal in value to browsing, and independent of it.

**Independent Test**: Open three files, edit each, switch between them, and
confirm each retains its content, cursor position, and unsaved state. Delivers
multi-document editing on top of P1.

**Acceptance Scenarios**:

1. **Given** one document is open, **When** the user opens a second file,
   **Then** both are open and individually selectable, and the second is active.
2. **Given** a file is already open, **When** the user opens that same file
   again, **Then** the existing view is activated rather than a duplicate
   created.
3. **Given** several documents are open with edits in each, **When** the user
   switches between them, **Then** each retains its content, unsaved-changes
   state, cursor position, scroll position, and undo history.
4. **Given** a document has unsaved changes, **When** the user closes it,
   **Then** the user is asked to save, discard, or cancel, and cancelling leaves
   the document open and unchanged.
5. **Given** a document has no unsaved changes, **When** the user closes it,
   **Then** it closes without a prompt.
6. **Given** documents with unsaved changes are open, **When** the user quits the
   application, **Then** the user is warned and told which documents are
   affected, and can cancel the quit.

---

### User Story 4 - Reorganise files and folders (Priority: P3)

A writer restructures their notes from within the application: renaming,
deleting, moving, and creating files and folders.

**Why this priority**: Valuable, but a writer can fall back on their operating
system's file manager. It is the least essential of the four stories.

**Independent Test**: With a folder open, create, rename, move, and delete both a
file and a folder, and confirm each change is reflected on disk and in the tree.

**Acceptance Scenarios**:

1. **Given** a folder tree is displayed, **When** the user renames a file or
   folder to an available name, **Then** it is renamed on disk and the tree
   updates.
2. **Given** a file is open and the user renames it in the tree, **When** the
   rename succeeds, **Then** the open document follows the new name and location.
3. **Given** a folder tree is displayed, **When** the user deletes a file or
   folder, **Then** the user must confirm first, and the confirmation names what
   will be deleted and warns if it is a non-empty folder.
4. **Given** a folder tree is displayed, **When** the user moves a file or folder
   into a different folder, **Then** it is moved on disk and the tree reflects
   its new position.
5. **Given** the user attempts to rename or move an item to a name that already
   exists, **When** the conflict is detected, **Then** the operation is refused
   with an explanation and nothing is overwritten.
6. **Given** the user attempts to move a folder into its own descendant,
   **When** the operation is attempted, **Then** it is refused — the drop does
   not land — and nothing is moved (see Clarifications 2026-08-02).
7. **Given** a folder tree is displayed, **When** the user creates a new file or
   folder, **Then** it appears on disk and in the tree, ready to be named.

---

### Edge Cases

**Filesystem boundary**

- An item in the opened folder is a shortcut or link pointing outside that
  folder: the application MUST NOT read or write through it to the outside
  target.
- A path containing traversal sequences, an absolute path, or a
  platform-reserved name is submitted: it is rejected without touching disk.
- The opened folder is deleted, renamed, or becomes unavailable (removed drive,
  disconnected network share) while in use: the application reports this
  clearly and does not present stale content as live.

**Content**

- The file is not valid UTF-8, or is binary despite a `.md` extension: it is
  reported as unopenable rather than opened and corrupted on save.
- The file contains markdown constructs the editor does not model, such as raw
  HTML blocks or unusual footnote syntax: opening and saving without edits MUST
  NOT silently discard or rewrite them.
- The file is very large (tens of megabytes): the application either opens it
  responsively or declines with an explanation, rather than freezing.
- The file is empty, or has no trailing newline: handled without error and
  without gratuitous reformatting.

**Concurrency and failure**

- The file changes on disk while open in the editor.
- The file becomes read-only, or the disk fills, during a save: the failure is
  reported and the document stays marked unsaved rather than appearing saved.
- A save is interrupted partway through: the previous file contents MUST NOT be
  left truncated or empty.
- A file open in the editor is deleted or renamed outside the application.

**Folder structure**

- The folder contains many thousands of entries, or is deeply nested.
- The folder contains symlink loops.
- The folder is empty.
- The folder contains no markdown files at all.

## Requirements *(mandatory)*

### Functional Requirements

**File access and safety**

- **FR-001**: The system MUST perform all disk access outside the document
  rendering context, exposing only a fixed set of named operations to it.
- **FR-002**: The system MUST treat the opened folder as a boundary and MUST
  refuse any read, write, rename, move, delete, or create operation whose
  resolved real target lies outside it.
- **FR-003**: The system MUST base boundary checks on the fully resolved real
  path, defeating traversal sequences, absolute paths, links pointing outside the
  boundary, and platform-specific path forms.
- **FR-004**: The system MUST fail closed on a rejected path, performing no
  filesystem action and reporting an error that does not disclose locations
  outside the boundary.

**Opening**

- **FR-005**: Users MUST be able to open a single markdown file via the
  application's standard File menu, without opening a folder first.
- **FR-006**: Users MUST be able to open a folder and see its structure as a
  navigable tree of files and folders.
- **FR-007**: The system MUST let the user expand and collapse folders in the
  tree.
- **FR-008**: The system MUST open a file for editing when the user selects it in
  the tree.
- **FR-009**: The system MUST report unreadable, unsupported, or non-text files
  clearly instead of opening them in a corrupted state.
- **FR-010**: The tree MUST list only folders and markdown files. Files with
  other extensions MUST be hidden from the tree.
- **FR-010a**: A folder MUST still be shown when it contains no markdown files,
  so that the user can navigate into it and create files there.

**Editing**

- **FR-011**: The system MUST display markdown as formatted text while editing,
  rather than as raw markup.
- **FR-012**: The system MUST support the common markdown constructs: headings,
  emphasis, lists, links, images, block quotes, code blocks, tables, and
  horizontal rules.
- **FR-013**: The system MUST provide per-document undo and redo.
- **FR-014**: The system MUST preserve markdown constructs it does not model
  through an open-and-save cycle without silent loss.

**Documents and tabs**

- **FR-015**: Users MUST be able to have multiple documents open simultaneously
  and switch between them.
- **FR-016**: The system MUST activate the existing view when a user opens a file
  that is already open, rather than opening it twice.
- **FR-017**: The system MUST preserve each open document's content, cursor
  position, scroll position, undo history, and unsaved-changes state when the
  user switches away from and back to it.
- **FR-018**: The system MUST visibly indicate which open documents have unsaved
  changes.
- **FR-019**: The system MUST support documents that have never been saved to
  disk, prompting for a location on first save.

**Saving**

- **FR-020**: Users MUST be able to save the active document to its existing
  location, and to a chosen new location.
- **FR-021**: The system MUST write saves atomically, so that an interrupted or
  failed save never leaves the target truncated, empty, or partially written.
- **FR-022**: The system MUST keep a document marked as unsaved and report the
  problem when a save fails.
- **FR-023**: The system MUST prompt before closing a document, window, or the
  application when unsaved changes exist, naming the affected documents and
  offering save, discard, and cancel.

**Organising**

- **FR-024**: Users MUST be able to rename, delete, move, and create files and
  folders within the opened folder.
- **FR-025**: The system MUST require explicit confirmation before deleting, and
  MUST state what is being deleted and whether a folder is non-empty.
- **FR-026**: The system MUST refuse operations that would overwrite an existing
  item, and MUST report the conflict rather than overwriting.
- **FR-027**: The system MUST refuse to move a folder into itself or its own
  descendants.
- **FR-028**: The system MUST keep open documents correctly associated with their
  files when those files are renamed or moved within the application.
- **FR-029**: Deletion MUST send the item to the operating system's recycle bin
  or trash where the platform provides one, so the action is recoverable.
- **FR-029a**: Where no trash facility is available, the system MUST state in
  the confirmation that the deletion is permanent before proceeding.
- **FR-029b**: Deleting a folder MUST move the folder and its entire contents to
  the trash, including any non-markdown files hidden from the tree by FR-010.
  The confirmation MUST warn when hidden files will be included.

**Presentation**

- **FR-030**: The system MUST present a sidebar and an editing area side by side,
  with a divider the user can drag to resize.
- **FR-031**: The system MUST persist sidebar width and restore it on restart.
- **FR-032**: The system MUST offer the standard File menu actions for the
  platform, with conventional keyboard shortcuts.
- **FR-033**: The system MUST make opening files and folders reachable from the
  interface as well as from the menu.

**Change detection**

- **FR-034**: The system MUST detect when a file backing an open document is
  modified by another program.
- **FR-035**: When such a file changes and the document has no unsaved changes,
  the system MUST reload it automatically and without interrupting the user.
- **FR-036**: When such a file changes and the document has unsaved changes, the
  system MUST inform the user and let them keep their version or replace it with
  the version from disk. It MUST NOT discard either version without a choice.
- **FR-037**: The system MUST NOT treat its own writes as external changes.
- **FR-038**: When a file backing an open document is deleted or renamed
  externally, the system MUST inform the user and keep the document's content
  available so it can be saved elsewhere.

### Key Entities

- **Workspace**: The single opened folder that defines the boundary for all file
  operations. Zero or one exists at a time.
- **Tree node**: A file or folder within the workspace, with a name, a location
  relative to the workspace, a kind, and for folders an expanded/collapsed state
  and children.
- **Document**: An open piece of content being edited. Has a display title,
  optionally an associated file location, current content, an unsaved-changes
  flag, undo history, and cursor and scroll position. A document without a file
  location has never been saved.
- **Editing session**: The set of open documents, which one is active, and the
  layout state such as sidebar width.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can open a markdown file, make an edit, and save it
  within 30 seconds of first launch, without consulting documentation.
- **SC-002**: Opening a document of up to 10,000 lines displays editable content
  within 1 second.
- **SC-003**: Typing in a document of up to 10,000 lines produces visible
  characters with no perceptible delay (under 50 ms) for every keystroke.
- **SC-004**: Switching between open documents completes within 100 ms and
  preserves cursor position, scroll position, and undo history in 100% of cases.
- **SC-005**: Opening a folder of 5,000 entries displays a navigable tree within
  2 seconds.
- **SC-006**: Opening and saving a document without editing it leaves the file on
  disk byte-identical in 100% of cases across the supported markdown constructs.
- **SC-007**: 100% of attempts to reach outside the opened folder — including
  traversal sequences, absolute paths, and links pointing outside — are refused,
  verified by an adversarial test suite.
- **SC-008**: No user edit is lost without an explicit confirmation, verified by
  covering every close, quit, and save-failure path.
- **SC-009**: An interrupted save never leaves the target file truncated or
  empty, in 100% of simulated interruption tests.
- **SC-010**: Every file operation that fails does so with a message naming what
  failed and why, with no silent failures.

## Assumptions

- **Single workspace**: One folder is open at a time. Opening another replaces
  it. Multi-root workspaces are out of scope.
- **Single window**: The application uses one window. Multiple windows and split
  editor panes are out of scope.
- **Local filesystem**: Documents are local files or on mounted shares. No cloud
  storage integration, sync, or collaborative editing.
- **Single user, no accounts**: There is no authentication, no permissions model,
  and no sharing.
- **UTF-8 text**: Markdown files are UTF-8 encoded. Other encodings are out of
  scope for this feature.
- **Markdown-only tree**: Per FR-010 the explorer hides non-markdown files.
  Accepted consequence: images and other attachments living alongside notes are
  invisible in the application and cannot be renamed, moved, or deleted from it,
  even though a folder deletion will still remove them. Recognised markdown
  extensions are `.md` and `.markdown`.
- **Rename keeps the markdown extension**: Renaming a file from the tree to a
  name without a recognised markdown extension is refused (see Clarifications
  2026-08-02). Moving a file between folders never changes its name.
- **Markdown flavour**: CommonMark plus GitHub Flavored Markdown tables, task
  lists, and strikethrough is the target. Arbitrary extension syntaxes are
  preserved where possible but not rendered specially.
- **Editing model**: Editing is WYSIWYG. A raw markdown source view is not
  required by this feature.
- **Search is out of scope**: Neither in-document find/replace nor
  across-workspace search is included here.
- **No document history**: No autosave, version history, backups, or session
  restore of previously open documents beyond layout state.
- **Packaging is out of scope for this feature**: Installers, release
  automation, file-type association, and automatic updates are tracked
  separately.
- **Platforms**: Windows, macOS, and Linux desktop. Behaviour follows each
  platform's conventions for menus and shortcuts where they differ.
- **Prior technical decisions**: The technology stack is fixed by
  `docs/DESIGN_DECISIONS.md` and is addressed in the implementation plan, not
  here.
