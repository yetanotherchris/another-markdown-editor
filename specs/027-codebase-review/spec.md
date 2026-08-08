# Feature Specification: Codebase Reliability and Maintainability Hardening

**Feature Branch**: `phase-027-codebase-review`
**Created**: 2026-08-08
**Status**: Ready
**Input**: User description: "Perform a full code review, create a Spec Kit spec for the required clean-code, code-pattern, security, reliability, and test changes, then implement it."

## User Scenarios & Testing

### User Story 1 - Workspace Files Stay Inside the Workspace (Priority: P1)

As a writer, I need every file operation to use the folder I opened as its security boundary, even when files or directories are replaced while an operation is in progress.

**Why this priority**: A path escape can disclose, overwrite, or delete files outside the workspace.

**Independent Test**: Exercise read, write, create, move, delete, trash, describe, and watch operations while replacing validated path components with links or junctions. No operation may affect an outside path.

**Acceptance Scenarios**:

1. **Given** a workspace-relative path that resolves inside the workspace, **When** a path component changes before the operation uses it, **Then** the operation fails closed or uses the originally validated target and no outside path is touched.
2. **Given** a folder selected for opening, **When** it is replaced between confirmation preparation and commit, **Then** the pending open is rejected and the current workspace remains unchanged.
3. **Given** any rejected path, **When** the failure is reported, **Then** it has a stable typed error and does not disclose an absolute outside path.

### User Story 2 - Privileged Operations Accept Only Valid Requests (Priority: P1)

As a user, I need privileged application operations to be callable only by the application and only with valid data, so malformed or untrusted content cannot bypass safety rules.

**Why this priority**: The process boundary and request boundary protect the local filesystem and unsaved work.

**Independent Test**: Invoke each privileged operation with malformed values, unknown channels, unsolicited lifecycle responses, and an untrusted document origin; all requests fail without side effects.

**Acceptance Scenarios**:

1. **Given** malformed or extra IPC data, **When** a request reaches the main process, **Then** it returns a declared error result and does not invoke filesystem, dialog, settings, or lifecycle work.
2. **Given** an application window, **When** it attempts an unexpected navigation or popup, **Then** the navigation or popup is denied.
3. **Given** a quit response without an active quit request, **When** it is submitted, **Then** it is rejected and dirty documents remain protected.
4. **Given** the application window is recreated, **When** the user invokes commands, **Then** commands target only the current window and current lifecycle state.

### User Story 3 - Saves Preserve the Latest User Content (Priority: P1)

As a writer, I need overlapping saves and failed writes to preserve my newest edits and the existing file, so no save can silently lose work.

**Why this priority**: Data loss is more damaging than a delayed save or visible error.

**Independent Test**: Start multiple saves, complete them out of order, and inject failures at each atomic-write stage. Verify disk content, dirty state, and error reporting.

**Acceptance Scenarios**:

1. **Given** two saves for one document, **When** the older save completes after the newer save, **Then** the newest content remains on disk and the document baseline reflects only the newest completed revision.
2. **Given** a failure while writing, syncing, closing, or renaming a temporary file, **When** the save fails, **Then** the old destination remains unchanged, temporary files are cleaned up, the document remains dirty, and the failure is actionable.
3. **Given** a user edit during an in-flight save, **When** the save completes, **Then** the edit remains dirty and is not overwritten by stale completion state.

### User Story 4 - Editing State Is Typed, Bounded, and Predictable (Priority: P1)

As a writer, I need tabs, editors, external changes, and workspace recreation to remain deterministic, responsive, and bounded as I work across many documents.

**Why this priority**: State races and unbounded editor instances cause lost edits, stale views, and degraded editing performance.

**Independent Test**: Open, edit, save, switch, evict, reactivate, and externally change many documents while asserting state invariants and response behavior.

**Acceptance Scenarios**:

1. **Given** any valid state transition, **When** it is reduced, **Then** the transition is represented by a typed action and produces a valid state without unchecked payload assertions.
2. **Given** the editor instance limit is reached, **When** a new tab is opened, **Then** the limit is respected immediately, the active editor remains usable, and evicted state rehydrates with its cursor and scroll state.
3. **Given** multiple external changes arrive while a prompt is open, **When** the prompt is resolved, **Then** every affected document is queued or deterministically coalesced and no change is silently lost.
4. **Given** a document is activated, **When** its file is inside collapsed folders, **Then** its ancestors expand and the file is selected and revealed; untitled or external documents clear tree selection.

### User Story 5 - The Interface Works Without Mouse-Only Interaction (Priority: P2)

As a keyboard or assistive-technology user, I need tabs and menus to expose correct focus, roles, states, and keyboard actions.

**Why this priority**: An editor's primary navigation must be usable without pointer-only behavior.

**Independent Test**: Navigate tabs and context menus with keyboard and inspect focus restoration and accessible states.

**Acceptance Scenarios**:

1. **Given** a tab list, **When** a user navigates to a tab and presses the documented activation key, **Then** the tab activates, exposes selected state, and closing it returns focus predictably.
2. **Given** a context or spelling menu, **When** it opens, **Then** focus enters the first enabled item, arrow navigation and activation work, Escape dismisses it, and focus returns to the origin.
3. **Given** asynchronous editor initialization is interrupted, **When** the host unmounts, **Then** no unhandled failure, stale instance, listener, or DOM residue remains.

### User Story 6 - Failures and Quality Gates Are Visible (Priority: P2)

As a maintainer and user, I need failures to be visible, tests to exercise the real boundaries, and quality commands to fail when they detect a regression.

**Why this priority**: A passing but incomplete test or silently ignored error creates false confidence.

**Independent Test**: Run the full validation commands, inject settings/read failures, and run the end-to-end suite under repeated clean conditions.

**Acceptance Scenarios**:

1. **Given** a file read or settings persistence failure, **When** it occurs, **Then** the current document/settings state is preserved and a quiet actionable message is shown.
2. **Given** a stuck end-to-end test or teardown, **When** the suite runs, **Then** it fails with a bounded diagnostic and does not swallow teardown errors.
3. **Given** a maintainability, formatting, lint, type, unit, or end-to-end violation, **When** the corresponding quality command runs, **Then** the command fails with an actionable report.
4. **Given** a clean checkout, **When** tests run, **Then** each test uses isolated workspace and configuration state and never writes to a developer's default configuration.

## Edge Cases

- A workspace root, ancestor, or destination is a symlink or junction.
- A path uses mixed separators, drive-relative syntax, UNC syntax, encoded traversal, a reserved device name, or an alternate data stream.
- A prepared folder is removed and replaced before confirmation commit.
- A filesystem error has an unknown native error code or contains an absolute path.
- A quit response is malformed, duplicated, delayed, or sent after a window has been recreated.
- A save fails after a temporary file is created, after synchronization, or during rename.
- A newer edit, external change, close, or workspace replacement occurs during a save.
- More than the configured number of clean and dirty tabs are open.
- Multiple watcher events arrive for the same file or for a workspace that is no longer active.
- Editor initialization resolves after the component has unmounted.
- A menu has no enabled items, or a settings write fails after the UI changed.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST bind each filesystem operation to the validated workspace target or use a documented race-resistant equivalent; validation followed by a later unbound path operation is not sufficient.
- **FR-002**: The system MUST verify that a prepared workspace is the same canonical directory at commit time and MUST leave the current workspace unchanged when it is not.
- **FR-003**: The system MUST reject unexpected navigation and new windows and MUST authorize privileged requests only from an approved application origin.
- **FR-004**: Every privileged operation MUST validate its request at runtime and return only a declared result and error-code union; unknown native errors MUST map to a safe fallback.
- **FR-005**: Lifecycle responses MUST be correlated to an active, one-time request and MUST reject malformed, unsolicited, duplicate, and stale responses.
- **FR-006**: Recreated windows MUST register current handlers and listeners exactly once, must not retain destroyed window references, and must reset window-specific lifecycle state.
- **FR-007**: All atomic writes MUST share one implementation, close resources on every path, preserve the prior destination on failure, and provide the documented durability guarantee.
- **FR-008**: Save orchestration MUST associate each write and completion with a document revision so stale completions cannot overwrite newer content, baselines, paths, or dirty state.
- **FR-009**: Reducer actions MUST be discriminated unions with specific payloads; production source MUST contain no `any` and reducers MUST be deterministic for equal state/action inputs.
- **FR-010**: Editor instance limits MUST be enforced immediately after every tab operation, including at capacity, and the policy for dirty tabs MUST preserve responsiveness and user content.
- **FR-011**: External-change notifications MUST be queued or deterministically coalesced without dropping distinct affected documents, and stale workspace events MUST be ignored.
- **FR-012**: Renderer path identifiers MUST be workspace-relative typed values; ancestry, rerouting, and watcher conversion MUST use one consistent boundary-safe model.
- **FR-013**: Explorer reveal, file-read failures, settings persistence failures, and editor initialization failures MUST have the specified safe and actionable behavior.
- **FR-014**: Tabs and menus MUST implement keyboard access, focus management, correct accessible state, activation, dismissal, and focus restoration.
- **FR-015**: Security, path, atomic-write, IPC, save-race, lifecycle, accessibility, editor lifecycle, watcher, and failure paths MUST have automated regression coverage.
- **FR-016**: End-to-end tests MUST have bounded startup and teardown, report teardown failures, isolate workspace/configuration state, and avoid fixed sleeps where observable synchronization is available.
- **FR-017**: Validation commands MUST cover supported source and tooling files, formatting, type checking, unit tests, end-to-end tests, and maintainability checks; a check presented as a gate MUST fail on violation.
- **FR-018**: Runtime dependencies MUST exclude test-only packages, supported runtime versions MUST be declared, and unresolved dependency advisories MUST be fixed or documented with reviewed mitigations.
- **FR-019**: Code changes MUST follow one-reason-to-change modules, thin orchestration roots, explicit dependencies, guard clauses, named constants, and structural-versus-behavioral commit separation.

### Key Entities

- **Workspace Boundary**: The canonical directory and the validated relationship between it and an operation target.
- **Privileged Request**: A runtime-validated operation request with a declared input and result contract.
- **Document Revision**: A monotonically ordered user-content version associated with a save attempt and completion.
- **Editing Session**: The typed collection of documents, active selection, editor state, and external-change state.
- **Quality Gate**: A deterministic command that reports and fails on a defined quality or regression condition.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All named path escape and path-replacement tests pass for every filesystem operation without modifying an outside fixture.
- **SC-002**: Malformed and unauthorized privileged requests produce declared errors with zero filesystem or lifecycle side effects.
- **SC-003**: Out-of-order save and injected atomic-write failure tests pass while preserving newest content, prior destination bytes, and dirty state.
- **SC-004**: The full unit and end-to-end suites pass twice consecutively from isolated clean test state with bounded teardown.
- **SC-005**: Lint, typecheck, formatting, maintainability, unit, and end-to-end commands all pass and fail when their targeted defect is introduced.
- **SC-006**: Keyboard-only acceptance scenarios pass for tabs and menus, including focus restoration.
- **SC-007**: No production source contains `any` or unchecked IPC response/request assertions at the implemented boundaries.

## Assumptions

- The existing product scope and user-visible behavior remain unchanged except where the scenarios explicitly correct unsafe, inaccessible, stale, or silent behavior.
- The existing workspace root remains the security boundary; this feature does not add multi-workspace support.
- Platform-specific race resistance will use the strongest available local filesystem primitives and will document any unavoidable residual platform limitation rather than weakening containment.
- The current configured editor instance cap remains the intended policy unless implementation evidence requires a spec clarification.
- Features whose active specifications are still Draft remain out of this hardening scope unless their code is directly required to satisfy a listed acceptance scenario.

## Clarifications

- **2026-08-08**: Findings that duplicate the same underlying defect are consolidated into the requirements above; the implementation must prioritize security and data-loss invariants over broad cosmetic refactoring.
- **2026-08-08**: “Full code review” means every production area is inspected and findings are recorded, but implementation scope is limited to actionable defects and patterns tied to the requirements and success criteria.
