# Feature Specification: View Source

**Feature Branch**: `002-view-source`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "I want to add a new feature. This is a \"view source\" button the milkdown toolbar, and also as a context menu item in the explorer. If the file is already open in the milkdown editor, I want an animation: the source view slides from the right side to take over as the tab's view.

The view source can be a simple text editor view, no syntax highlighting is needed. To avoid complication though, view source is visible, or the milkdown view is visible - one or the other, but not both. There should be some way of returning to the milkdown wywiwyg view from the view source view, perhaps a small button at the top in a similar sized menu toolbar to the milkdown one."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit raw markdown in an open document (Priority: P1)

A writer editing a formatted document can switch its active tab to an editable
raw markdown source view, make changes, and return to the formatted view without
losing those changes.

**Why this priority**: Direct source editing is the core value of the feature,
letting writers work with markdown constructs that are easier to inspect or edit
as text.

**Independent Test**: Open a document, activate View source from the formatted
editor toolbar, change its markdown, return to the formatted view, and verify
the change is represented and remains unsaved until saved.

**Acceptance Scenarios**:

1. **Given** an open document is displayed in the formatted editor, **When** the
   user chooses View source from its toolbar, **Then** the source view slides in
   from the right and replaces the formatted editor within that tab.
2. **Given** a document is displayed in source view, **When** the user changes
   its text, **Then** the document is marked as having unsaved changes using the
   same indication as edits made in the formatted editor.
3. **Given** a document with source edits is displayed in source view, **When**
   the user returns to the formatted view, **Then** the formatted content reflects
   those edits and the document remains marked as unsaved.
4. **Given** a document is displayed in source view, **When** the user returns to
   the formatted view without editing it, **Then** the document content and
   unsaved-changes state are unchanged.

---

### User Story 2 - Open a file directly in source view (Priority: P2)

A writer browsing the workspace can use a file's context menu to open its raw
markdown immediately, without first opening it in the formatted editor.

**Why this priority**: It provides a direct route to source editing for files
selected in the explorer and complements the toolbar action.

**Independent Test**: With a workspace open, invoke View source from a markdown
file's context menu and verify the file opens in an active source view.

**Acceptance Scenarios**:

1. **Given** a markdown file is visible in the explorer and is not open, **When**
   the user chooses View source from its context menu, **Then** the file opens in
   a new active tab displaying source view.
2. **Given** a markdown file is already open in a formatted view, **When** the
   user chooses View source from its explorer context menu, **Then** its existing
   tab becomes active and source view slides in from the right to replace the
   formatted view.
3. **Given** a markdown file is already open in source view, **When** the user
   chooses View source from its explorer context menu, **Then** its existing tab
   becomes active without creating a duplicate tab or changing its content.

---

### User Story 3 - Return to formatted editing (Priority: P3)

A writer in source view has a clear, compact control for returning to the
formatted editor while keeping the source and formatted editors mutually
exclusive.

**Why this priority**: Writers need an obvious way back to their normal editing
experience; it completes the view-switching workflow without adding a split view.

**Independent Test**: Open a document in source view, activate the return
control, and verify the formatted editor is the only document view shown.

**Acceptance Scenarios**:

1. **Given** a document is in source view, **When** the user selects the return
   control in its top toolbar, **Then** the formatted editor replaces the source
   view in that tab.
2. **Given** a document is switching between source and formatted views, **When**
   the transition completes, **Then** exactly one of the two document views is
   visible in the tab.

---

### User Story 4 - Understand formatting controls (Priority: P3)

A writer can identify the purpose of every formatted-editor toolbar control
without trial and error by using its help tooltip.

**Why this priority**: Clear control labels make existing formatting functions
discoverable and prevent accidental use of unfamiliar icons.

**Independent Test**: Open a formatted document, focus or hover each toolbar
control, and verify that an explanatory tooltip identifies its action.

**Acceptance Scenarios**:

1. **Given** a formatted document is open, **When** the user hovers over or
   focuses a toolbar control, **Then** an explanatory tooltip identifies the
   control's action.
2. **Given** the formatted editor toolbar is visible, **When** every available
   control is checked, **Then** each control has an explanatory tooltip.

---

### User Story 5 - Remove an empty task item (Priority: P2)

A writer can use Backspace to remove an empty task-list item in formatted
editing, including an item created by the checklist control.

**Why this priority**: A task item that cannot be removed traps the writer in an
unwanted list structure and interrupts basic editing.

**Independent Test**: Create a task-list item with the checklist control, leave
it empty, press Backspace at its start, and verify the task item no longer
remains in the document.

**Acceptance Scenarios**:

1. **Given** the cursor is at the start of an empty task-list item, **When** the
   user presses Backspace, **Then** the empty task item is removed and the cursor
   remains in an editable document position.
2. **Given** the cursor is at the start of the only empty task-list item,
   **When** the user presses Backspace, **Then** the task-list structure is
   removed rather than leaving an undeletable checkbox item.
3. **Given** a task-list item contains text, **When** the user presses Backspace
   away from the item start, **Then** ordinary text-deletion behavior is
   preserved.

---

### User Story 6 - Identify the active file in the explorer (Priority: P2)

A writer switching between open document tabs can immediately see which file is
currently displayed because that file is highlighted in the workspace explorer.

**Why this priority**: The explorer must remain an accurate visual reference when
several similarly named documents are open, especially in nested folders.

**Independent Test**: Open two workspace files in separate tabs, switch between
them, and verify that the explorer highlight changes to the file displayed by the
active tab each time.

**Acceptance Scenarios**:

1. **Given** two files from the open workspace are displayed in separate tabs,
   **When** the user activates either tab, **Then** that tab's file is highlighted
   in the explorer.
2. **Given** the active document's file is inside a collapsed explorer folder,
   **When** the user activates its tab, **Then** the explorer highlights that file
   in a visible path.
3. **Given** the active tab is a document without an associated workspace file,
   **When** the user activates it, **Then** the explorer does not retain a
   misleading file highlight from a previously active tab.

---

### Edge Cases

- A source edit contains markdown that cannot be represented as formatted content:
  the raw text remains available in source view, the document stays unsaved, and
  the user receives a clear in-context explanation rather than losing the edit.
- The user switches tabs during a view transition: the newly selected tab remains
  usable, and returning to the transitioning tab shows one complete document view
  with its current content intact.
- The user closes or quits while a document modified in source view is unsaved:
  existing unsaved-changes confirmation behaviour applies.
- A file opened in source view changes on disk: existing external-change handling
  applies using the document's current unsaved-changes state.
- Empty files, files without a trailing newline, and documents up to 10,000 lines
  can be shown and edited in source view without gratuitous content changes.
- A formatted-editor toolbar control is unavailable or disabled: its tooltip
  still identifies its purpose and, where relevant, explains why it cannot
  currently be used.
- An empty task-list item follows ordinary text, another list item, or is the
  only item in its list: Backspace removes the empty task item without leaving an
  undeletable checkbox or unexpectedly deleting preceding content.
- The active tab's file is renamed or moved within the workspace: the explorer
  highlight follows the document's updated location after the operation succeeds.
- The active file is removed from the workspace or its containing folder is no
  longer available: the explorer clears the file highlight rather than showing a
  stale selection.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The formatted editor toolbar MUST provide a clearly labeled View
  source action for the active document.
- **FR-002**: Choosing View source from an open document's formatted editor MUST
  replace the formatted document view with an editable raw markdown source view
  in the same tab.
- **FR-003**: When source view is opened for a document currently shown in the
  formatted editor, the replacement transition MUST slide the source view in from
  the right.
- **FR-004**: The explorer context menu for each markdown file MUST provide a View
  source action.
- **FR-005**: Choosing View source for an unopened explorer file MUST open that
  file in a new active tab directly in source view.
- **FR-006**: Choosing View source for an explorer file that is already open MUST
  activate its existing tab rather than create a duplicate; if it is in formatted
  view, it MUST switch using the transition in FR-003.
- **FR-007**: Source view MUST provide an editable plain-text representation of
  the document's markdown; syntax highlighting is not required.
- **FR-008**: Source view MUST include a compact top toolbar, comparable in height
  to the formatted editor toolbar, with a clearly labeled action that returns the
  document to formatted editing.
- **FR-009**: At all completed states and during transitions, a tab MUST show no
  more than one document editing view; source and formatted views MUST NOT be
  simultaneously usable or visible as a split view.
- **FR-010**: Edits made in source view MUST update the same document content and
  unsaved-changes state used by formatted editing and saving.
- **FR-011**: Returning from source view to formatted editing MUST preserve source
  edits; when those edits can be represented as formatted content, the formatted
  view MUST reflect them.
- **FR-012**: If source changes cannot be displayed in formatted editing, the
  system MUST preserve the source text, keep the document unsaved, and explain
  the issue in context without discarding edits.
- **FR-013**: Existing protections for saving, closing, quitting, and external
  file changes MUST apply equally to documents edited in source view.
- **FR-014**: Switching a document between its source and formatted views MUST NOT
  create a duplicate document or alter another open document's content, view, or
  unsaved-changes state.
- **FR-015**: Every control in the formatted editor toolbar MUST provide an
  explanatory tooltip that identifies its action when the control is hovered or
  receives keyboard focus.
- **FR-016**: When the cursor is at the start of an empty task-list item in
  formatted editing, pressing Backspace MUST remove that item and leave the
  cursor in an editable document position.
- **FR-017**: When an empty task-list item is the only item in its list, removing
  it with Backspace MUST remove the task-list structure so no undeletable
  checkbox remains.
- **FR-018**: The task-list Backspace behavior in FR-016 and FR-017 MUST NOT
  change ordinary text deletion when the cursor is not at the start of an empty
  task-list item.
- **FR-019**: When an active tab represents a file in the open workspace, the
  explorer MUST highlight that file as the currently viewed item.
- **FR-020**: The explorer highlight MUST update whenever the active tab changes,
  including when the tab's selected document view is source editing.
- **FR-021**: When the active tab has no associated workspace file or its file is
  no longer present in the explorer, the explorer MUST clear any prior active-file
  highlight rather than display a stale selection.

### Key Entities

- **Document view**: The currently selected editing presentation for an open
  document, either formatted editing or raw markdown source editing.
- **Source edit**: A change to a document's raw markdown while source view is
  active; it contributes to the document's shared content and unsaved-changes
  state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability testing, at least 90% of users can switch an open
  document from formatted editing to source editing and back within 20 seconds
  on their first attempt.
- **SC-002**: For documents up to 10,000 lines, opening source view or returning
  to formatted editing presents the requested view within 1 second in at least
  95% of measured attempts.
- **SC-003**: In 100% of automated view-switching tests, each document tab shows
  exactly one editable document view after the requested transition completes.
- **SC-004**: In 100% of automated tests, edits made in source view remain present
  after returning to formatted editing and retain their unsaved status until a
  successful save.
- **SC-005**: In 100% of automated explorer tests, choosing View source for an
  already open file activates its existing tab without increasing the number of
  open tabs.
- **SC-006**: In 100% of automated toolbar tests, every formatted-editor toolbar
  control exposes an explanatory tooltip on hover or keyboard focus.
- **SC-007**: In 100% of automated task-list tests, Backspace removes an empty
  task-list item without leaving an undeletable checkbox or altering preceding
  content.
- **SC-008**: In 100% of automated tab-switching tests involving workspace files,
  the explorer highlights the file represented by the active tab; it clears the
  highlight for a tab without an associated workspace file.

## Assumptions

- **Editable source**: Source view is an editor for raw markdown, not a read-only
  preview, because it is intended as an alternative editing view.
- **One view per tab**: Each document tab retains one selected view at a time;
  split, side-by-side, and simultaneous source and formatted editing are out of
  scope.
- **Per-document view selection**: Opening or switching one document to source
  view does not switch any other open document. A document opened directly from
  the explorer's View source action starts in source view.
- **Existing document rules**: Source edits use the document model's existing
  save, dirty-state, close, quit, and external-change rules.
- **Presentation scope**: The only requested animated transition is from formatted
  editing to source view for an already open document. The return action may use
  the application's standard non-disruptive view change.
- **Plain text scope**: Syntax highlighting, language services, find/replace, and
  a separate source-editing toolbar beyond the return action are out of scope.
- **Tooltip scope**: Tooltips identify the existing formatted-editor toolbar
  actions; they do not add documentation panels, tutorials, or new controls.
- **Task-list deletion**: The requested deletion correction covers Backspace at
  the start of an empty task-list item. Other task-list keyboard behavior remains
  unchanged unless required to preserve ordinary text deletion.
- **Explorer selection**: The explorer highlight identifies the file represented
  by the active tab, not the most recently clicked tree item. The feature does
  not add multi-selection or change how a user opens files from the explorer.
- **Raw bytes are authoritative** *(decided 2026-08-02)*: The document's stored
  content and baseline are the exact bytes read from disk, never Crepe's
  normalized serialization. Crepe always appends a single trailing newline
  (verified empirically in this phase), so its first emission must not rewrite a
  pristine file, give a file without a trailing newline a gratuitous newline, or
  mark it dirty. The store never adopts an editor emission as content/baseline
  (the `CAPTURE_BASELINE` reducer action is a no-op); only the renderer compares
  raw-vs-editor text with trailing-newline/EOL tolerance (`markdownSame`) to
  decide dirtiness. Source-view saves write the stored raw content verbatim.

## Clarifications

- **2026-08-02 — Explorer reveal is lazy**. FR-019/020's highlight for a file
  inside a folder that has never been expanded is achieved by lazily opening the
  parent chain (`openParents`) when the tab becomes active; the folder is
  auto-expanded and the file selected rather than the highlight being dropped.
  The check uses the workspace-relative form of a document's path (files opened
  through the OS dialog are absolute paths and clear the highlight).
- **2026-08-02 — Editor serialization never replaces pristine content**.
  `flushLiveContent()` (and the pool-eviction path) adopt a formatted editor's
  live text into `content` only when the reducer already knows the document is
  dirty. A pristine file's stored bytes are never replaced by Crepe's
  serialization, so Value: clicking View source on an unedited file whose
  serialization normalizes (loose pipes, entities, autolinks) cannot mark it
  dirty. A sub-200 ms debounce window where a freshly typed keystroke on a
  pristine file is not yet `dirty` is not adopted on that exact switch; the
  keystroke is retained by the editor and surfaces on the next change.
- **2026-08-02 — Return-to-formatted remount is strict about EOF blanks.** The
  no-remount (no-op) decision uses `editorMatchesContent` — only the editor's
  single appended trailing newline counts as unchanged. An extra blank line
  typed at end-of-file in source view therefore survives the return.
