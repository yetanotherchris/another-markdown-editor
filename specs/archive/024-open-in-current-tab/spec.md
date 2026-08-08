# Feature Specification: Open in Current Tab

**Feature Branch**: `024-open-in-current-tab`

**Created**: 2026-08-07

**Status**: Archived

**Input**: User description: "Open files in the current tab when no unsaved changes exist in that tab, otherwise open in a new tab"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse files without tab clutter (Priority: P1)

A user is browsing through files in the workspace explorer. Each file they click replaces the content of the current tab, so the tab bar does not fill up with tabs they are just glancing at. When they find a file they want to edit, they make a change, and from that point the tab is "owned" — subsequent file opens go to new tabs.

**Why this priority**: This is the core behaviour change. Without it, every click creates a permanent tab, which clutters the tab bar during exploration and forces manual cleanup.

**Independent Test**: Open a file from the explorer while the active tab is clean. Verify the file content appears in the same tab (no new tab created). Then type a character to make the tab dirty. Open another file from the explorer. Verify a new tab is created.

**Acceptance Scenarios**:

1. **Given** the active tab is clean (no unsaved changes) and shows a saved file, **When** the user opens a different file from the explorer, **Then** the new file's content replaces the current tab's content and no new tab appears.
2. **Given** the active tab is dirty (has unsaved changes), **When** the user opens a different file from the explorer, **Then** a new tab is created for the new file and the dirty tab remains open.
3. **Given** the active tab is clean and shows an untitled (never-saved) document, **When** the user opens a file from the explorer, **Then** the new file's content replaces the current tab's content and no new tab appears.
4. **Given** the active tab is clean and already shows the same file the user tries to open, **When** the user opens that file from the explorer, **Then** the existing tab is activated with no visible change (current behaviour preserved).

---

### User Story 2 - Intentional multi-tab workflow preserved (Priority: P2)

A user has several files open in tabs, each with work in progress. They open additional files from the explorer. Because the active tab has unsaved changes, the new files open in new tabs as before. The user's existing workflow is not disrupted.

**Why this priority**: Existing behaviour must not regress for users who already have dirty tabs open. This ensures the feature is additive, not disruptive.

**Independent Test**: Open two files, make one dirty, activate the dirty tab, then open a third file from the explorer. Verify a new tab is created and the dirty tab is untouched.

**Acceptance Scenarios**:

1. **Given** multiple tabs are open and the active tab is dirty, **When** the user opens a new file, **Then** a new tab is created and all existing tabs remain unchanged.
2. **Given** multiple tabs are open and the active tab is clean, **When** the user opens a new file, **Then** the clean tab's content is replaced; no other tabs are affected.

---

### User Story 3 - Explicit new-tab actions always create a tab (Priority: P3)

A user wants to keep the current file visible while opening another. They use an explicit "open in new tab" action (e.g. middle-click, or a keyboard modifier) and the file always opens in a new tab regardless of the active tab's dirty state.

**Why this priority**: Power users need a way to opt out of the replacement behaviour. This is a convenience escape hatch, not the primary flow.

**Independent Test**: With a clean active tab, middle-click (or modifier-click) a file in the explorer. Verify a new tab is created instead of replacing the current tab.

**Acceptance Scenarios**:

1. **Given** the active tab is clean, **When** the user middle-clicks a file in the explorer, **Then** a new tab is created for that file and the current tab's content is unchanged.
2. **Given** the active tab is dirty, **When** the user middle-clicks a file in the explorer, **Then** a new tab is created (same as current behaviour).

---

### Edge Cases

- What happens when there are no open tabs (no active tab)? The file opens in a new tab as usual — there is no tab to replace.
- What happens when the user opens a file that is already open in another (inactive) tab? The existing tab is activated (current behaviour preserved), regardless of whether the active tab is clean or dirty.
- What happens when the active tab is clean but shows a file from a different workspace? The tab is replaced — the workspace origin of the clean tab does not matter.
- What happens to undo history when a clean tab is replaced? The replaced tab's undo history is discarded, since the tab was clean (no unsaved work to protect).
- What happens if the user rapidly clicks multiple files? Each click replaces the active tab's content in sequence; only the last-clicked file remains visible, with no extra tabs created.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a file is opened from the explorer and the active tab is clean (not dirty), the system MUST replace the active tab's content with the new file's content instead of creating a new tab.
- **FR-002**: When a file is opened from the explorer and the active tab is dirty (has unsaved changes), the system MUST open the file in a new tab (current behaviour).
- **FR-003**: When a file is opened and a tab for that file path already exists (in any position), the system MUST activate the existing tab regardless of the active tab's dirty state (current behaviour preserved).
- **FR-004**: When there is no active tab, opening a file MUST create a new tab (current behaviour preserved).
- **FR-005**: The system MUST provide a way to explicitly open a file in a new tab regardless of the active tab's dirty state (e.g. middle-click or modifier key).
- **FR-006**: Replacing a clean tab's content MUST update the tab's displayed filename, path, and content to reflect the newly opened file.
- **FR-007**: After a tab is replaced, the tab MUST behave as if the new file had been opened in a new tab — dirty flag is clear, undo history starts fresh for the new document.
- **FR-008**: The replacement behaviour MUST apply to all file-opening entry points: single-click in explorer, double-click in explorer, context menu "Open", and menu File > Open.
- **FR-009**: Untitled (never-saved) documents in a clean active tab MUST be replaceable — opening a file replaces the untitled content without prompting.

### Key Entities

- **Tab dirty state**: Whether the active tab has unsaved changes. This is the sole determinant of whether a file open replaces the tab or creates a new one.
- **Tab identity**: A tab is identified by its file path once saved. An untitled tab has no path and is always replaceable when clean.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users browsing files sequentially create at most one tab per browsing session (instead of one tab per file clicked), reducing tab bar clutter by at least 80% in typical exploration workflows.
- **SC-002**: 100% of existing tab-close and unsaved-changes confirmation behaviours remain unchanged — no regressions in data-loss prevention.
- **SC-003**: Users can open a file in a new tab explicitly within one interaction (middle-click or modifier-click), with no additional dialogs or steps.
- **SC-004**: Tab replacement completes instantly with no perceptible delay — the new file's content appears in the same tab within the same frame as the click.

## Assumptions

- The dirty flag (unsaved changes) is the only criterion for deciding whether a tab is "replaceable". No other state (view mode, cursor position, scroll position) affects the decision.
- "Clean" includes both saved files (content matches disk) and untitled documents that have never been typed into. Both are replaceable without confirmation.
- The existing "activate existing tab if path matches" behaviour takes priority over the replacement behaviour. If file X is already open in tab 3, opening file X always activates tab 3, even if the active tab is clean.
- The explicit new-tab action (FR-005) will use middle-click as the primary trigger, consistent with browser tab conventions. Keyboard modifier (e.g. Ctrl+click) may be added as a secondary trigger.
- Editor instance pool eviction behaviour is unaffected — a replaced tab's editor instance is handled the same way as a closed tab's instance.
