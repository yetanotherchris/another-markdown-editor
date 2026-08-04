# Feature Specification: Native Dialogs

**Feature Branch**: `008-native-dialogs`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "This speckit spec is to make the confirmation dialogues appear more OS-native. So more like Windows, Mac or Linux dialogues - the button order should match the OS and the look and feel. List the dialogues used as well, I can think of the discard dialogue and exit dialogue"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recognize a familiar confirmation prompt (Priority: P1)

A writer sees confirmation prompts that use their operating system's familiar
dialog appearance, button order, keyboard conventions, and action emphasis.

**Why this priority**: Confirmation prompts protect work and destructive actions.
Matching platform conventions lets users interpret those decisions confidently
without relearning the interface.

**Independent Test**: On supported Windows, macOS, and Linux environments, trigger
each confirmation dialog and compare its visual treatment, button ordering,
default action, cancellation behavior, and keyboard handling with that operating
system's conventions.

**Acceptance Scenarios**:

1. **Given** a confirmation dialog is shown on Windows, **When** the user views
   its controls, **Then** its look, button order, default action, destructive
   emphasis, and cancellation behavior follow Windows conventions.
2. **Given** a confirmation dialog is shown on macOS, **When** the user views its
   controls, **Then** its look, button order, default action, destructive
   emphasis, and cancellation behavior follow macOS conventions.
3. **Given** a confirmation dialog is shown on Linux, **When** the user views its
   controls, **Then** its look, button order, default action, destructive
   emphasis, and cancellation behavior follow the active desktop environment's
   conventions where available.
4. **Given** a confirmation dialog offers a destructive choice, **When** the user
   views it, **Then** the destructive choice is visually distinct but is not made
   the default action merely because it is destructive.

---

### User Story 2 - Protect work through native unsaved-changes dialogs (Priority: P1)

A writer closing a modified document or exiting with modified documents receives
a familiar platform-appropriate choice to save, discard, or cancel.

**Why this priority**: These are the primary protections against losing the
writer's work and must remain unmistakable across operating systems.

**Independent Test**: Modify a document, trigger tab close and application exit on
each supported platform, and verify the platform-appropriate dialog preserves
the same save, discard, and cancel outcomes.

**Acceptance Scenarios**:

1. **Given** a document has unsaved changes, **When** the user closes its tab,
   **Then** an operating-system-native unsaved-changes dialog identifies the
   document and offers save, discard, and cancel outcomes.
2. **Given** one or more documents have unsaved changes, **When** the user exits
   the application, **Then** an operating-system-native exit dialog identifies
   the affected documents and offers save all, discard and exit, and cancel
   outcomes.
3. **Given** either unsaved-changes dialog is open, **When** the user cancels it
   using the platform's standard cancellation action, **Then** the document or
   application remains open and unchanged.
4. **Given** either unsaved-changes dialog is open, **When** the user chooses a
   save outcome and saving fails, **Then** the affected work remains open and
   unsaved, and the failure is explained without treating the dialog as resolved.

---

### User Story 3 - Confirm destructive and replacement decisions clearly (Priority: P1)

A writer receives a native-looking, specific confirmation before a deletion,
permanent deletion, or replacement of their in-memory document with an external
file version.

**Why this priority**: These operations can remove, replace, or make the writer's
work unavailable, so the meaning and safest option must be immediately clear.

**Independent Test**: Trigger delete, permanent-delete fallback, and external-file
change dialogs on each supported platform; verify their native presentation and
that each action retains its specified data-safety outcome.

**Acceptance Scenarios**:

1. **Given** a user deletes a file or folder, **When** the delete confirmation is
   shown, **Then** it identifies the target and states that it will move to trash
   or recycle bin before offering cancel and delete choices.
2. **Given** trash or recycle bin is unavailable, **When** permanent deletion is
   proposed, **Then** the dialog explicitly states that the operation cannot be
   undone and requires a distinct destructive confirmation.
3. **Given** an open modified file changed on disk, **When** the replacement
   prompt is shown, **Then** it clearly distinguishes keeping the in-memory
   version from reloading the external version.
4. **Given** an open file is deleted or renamed on disk, **When** the notice is
   shown, **Then** it makes clear that the in-memory content remains available
   and offers the existing save-to-a-new-location outcome.

---

### User Story 4 - Receive readable native status prompts (Priority: P2)

A writer sees native-looking status prompts when deletion is blocked by unsaved
work or an operation fails, with a clear acknowledgement action.

**Why this priority**: These prompts prevent confusing silent failures while
keeping non-destructive errors calm and understandable.

**Independent Test**: Trigger a deletion blocked by a dirty document and an
operation failure, then verify that each dialog follows platform conventions,
explains the condition, and can be dismissed without changing work.

**Acceptance Scenarios**:

1. **Given** a requested deletion would affect unsaved work, **When** the blocked
   deletion dialog is shown, **Then** it identifies the affected documents and
   explains that they must be saved or closed before deletion.
2. **Given** an operation fails, **When** the error dialog is shown, **Then** it
   explains what failed and provides a platform-conventional acknowledgement
   action.

---

### Dialog Inventory

The feature applies to these existing dialog surfaces:

1. **Unsaved document close**: Shown before closing one modified document; offers
   save, discard, and cancel.
2. **Unsaved application exit**: Shown before exiting with one or more modified
   documents; lists affected documents and offers save all, discard and exit, and
   cancel.
3. **External file changed**: Shown when a modified open file changes on disk;
   offers keeping the in-memory version or reloading from disk.
4. **External file deleted or renamed**: Shown when an open file disappears or is
   renamed outside the application; explains that in-memory content remains open
   and offers acknowledgement or saving to a new location.
5. **Delete to trash or recycle bin**: Shown before deleting a file or folder;
   identifies the target and offers cancel or delete.
6. **Permanent delete fallback**: Shown when trash or recycle bin is unavailable;
   explains irreversibility and offers cancel or permanent deletion.
7. **Delete blocked by unsaved changes**: Shown when deleting an item would affect
   documents with unsaved work; lists blockers and offers acknowledgement.
8. **Operation failed**: Shown for a failed application operation; explains the
   failure and offers acknowledgement.
9. **Open folder with unsaved changes**: Shown before opening a new workspace
   while workspace-relative documents have unsaved changes; lists the affected
   documents and offers save all, discard, and cancel (2026-08-04 clarification
   — existing surface from spec 004, FR-010, added to the inventory so the
   whole application converts consistently).

### Edge Cases

- A dialog has a destructive action in progress: platform-conventional controls
  prevent duplicate activation or dismissal that would leave the outcome unclear.
- The user presses Escape, uses the platform cancellation shortcut, or closes a
  confirmation prompt by a platform-standard method: the operation is cancelled
  whenever cancelling is safe and available.
- A dialog is opened while another dialog is already present: the application
  shows one decision surface at a time and does not let actions apply to an
  obscured or stale dialog.
- A long file name, folder name, or list of affected documents must be shown: the
  dialog remains readable, identifies the affected items accurately, and keeps
  every action reachable.
- Keyboard-only and assistive-technology users invoke a dialog: its title,
  purpose, choices, default action, and destructive nature are announced and
  navigable according to platform conventions.
- Platform-native presentation is unavailable on a supported Linux desktop: the
  fallback preserves the active desktop's ordering and accessibility conventions
  as closely as possible, without weakening any confirmation or safety rule.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST present every dialog in the Dialog Inventory
  using the visual language, button ordering, default action treatment,
  destructive-action treatment, focus behavior, and keyboard conventions of the
  user's operating system.
- **FR-002**: The application MUST use the operating system's native confirmation
  presentation where it can express the dialog's required content and choices; if
  it cannot, the fallback MUST closely follow that operating system's conventions.
- **FR-003**: The application MUST apply platform-appropriate button order for
  every dialog and MUST NOT impose one operating system's order on another.
- **FR-004**: Every dialog MUST have a safe, platform-conventional cancellation
  outcome when its operation can be safely cancelled.
- **FR-005**: Every destructive option MUST be clearly labeled for its actual
  consequence, visually distinct according to platform convention, and require
  explicit user activation.
- **FR-006**: The default action for a confirmation dialog MUST be the
  platform-appropriate safe or expected choice and MUST NOT discard, permanently
  delete, or replace user work without an explicit user decision.
- **FR-007**: The unsaved document close dialog MUST identify the affected
  document and preserve save, discard, and cancel outcomes.
- **FR-008**: The unsaved application exit dialog MUST list affected documents and
  preserve save all, discard and exit, and cancel outcomes.
- **FR-009**: Delete-to-trash and permanent-delete dialogs MUST identify the
  target, distinguish recoverable from irreversible deletion, and preserve their
  required cancellation and confirmation outcomes.
- **FR-010**: External-change dialogs MUST preserve the existing choices to keep
  in-memory content, reload from disk where applicable, and save retained content
  to a new location when the backing file disappeared.
- **FR-011**: Blocked-deletion and operation-failed dialogs MUST explain the
  condition clearly and preserve the current documents and workspace when
  acknowledged.
- **FR-012**: Dialogs MUST prevent duplicate completion while a destructive action
  is in progress and MUST NOT enable cancellation while the operation continues.
- **FR-013**: All dialog text, affected-item lists, actions, default actions, and
  destructive consequences MUST be available to keyboard-only and assistive-
  technology users.
- **FR-014**: The native dialog presentation MUST NOT weaken existing safeguards
  for unsaved changes, failed saves, external file changes, delete confirmation,
  permanent-delete confirmation, or path validation.

### Key Entities

- **Confirmation dialog**: A decision surface that requires explicit user choice
  before an operation can discard, replace, delete, permanently delete, or close
  user work.
- **Native dialog convention**: The active operating system's expected dialog
  appearance, action placement, keyboard behavior, focus behavior, and action
  emphasis.
- **Destructive action**: An action that can discard, replace, delete, or
  permanently delete user content or an item.
- **Safe cancellation**: A dialog outcome that leaves the pending operation and
  current user work unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of supported-platform dialog tests, every inventory dialog
  uses the active operating system's button order, action emphasis, default-action
  treatment, and keyboard conventions or the closest available equivalent.
- **SC-002**: In 100% of unsaved-close and unsaved-exit tests, cancel preserves
  all modified documents and save failure leaves the affected documents open and
  unsaved.
- **SC-003**: In 100% of destructive-operation tests, deletion, permanent
  deletion, reload-from-disk, and discard outcomes require explicit user
  activation and do not occur through default focus, Escape, or dismissal.
- **SC-004**: In 100% of destructive-operation-in-progress tests, the dialog
  cannot be completed a second time or cancelled while the action continues.
- **SC-005**: In 100% of keyboard and assistive-technology tests, every dialog's
  title, explanatory text, available actions, default action, and destructive
  action are reachable and announced.
- **SC-006**: In usability testing, at least 90% of users on each supported
  platform identify the safest available outcome for an unsaved-changes or
  permanent-delete dialog on their first attempt.

## Assumptions

- **Dialog scope**: The Dialog Inventory is the complete set of existing modal
  confirmation and status dialog surfaces included in this feature. Standard
  operating-system file and folder pickers are already native and are not changed.
- **Platform scope**: The target platforms are Windows, macOS, and Linux. Linux
  presentation follows the active desktop environment where it provides a native
  convention; exact appearance can vary between Linux distributions.
- **Behaviour preservation**: This feature changes presentation and platform
  interaction conventions only. It does not remove actions, alter confirmation
  thresholds, or relax data-loss and path-safety protections.
- **Future dialogs**: A new application dialog that asks the user to confirm a
  destructive or data-replacing outcome must follow the same native-dialog
  requirements when it is added.

## Clarifications

- **2026-08-04 — Folder-open confirmation is in scope**: The existing
  "Open folder with unsaved changes?" confirmation (spec 004, FR-010) is added
  to the Dialog Inventory as item 9. It converts to the native presentation with
  the same Save All / Discard / Cancel outcomes, so the whole application uses
  one dialog style.
- **2026-08-04 — Default actions**: Recoverable destructive actions (delete to
  trash) may be the default action where the platform expects them. Irreversible
  actions (permanent delete) are never the default on any platform; the safe
  cancellation is always the default there.
