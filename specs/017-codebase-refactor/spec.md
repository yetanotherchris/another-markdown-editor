# Feature Specification: Codebase Refactor

**Feature Branch**: `[017-codebase-refactor]`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "These two files contain refactor suggestions and improvements for the codebase. This spec is to follow the refactor suggestions (add these two files as assets for the spec) to make the code base cleaner and more easily maintainable."

**Reference assets**: The two suggestion documents that drive this spec are stored at `specs/017-codebase-refactor/assets/`:
- `grok-another-markdown-editor-maintainability-suggestions.md` (17 numbered suggestions, full `src` and `tests` scope)
- `claude-suggested-changes.md` (27 numbered suggestions, full `src` and `tests` scope)

## User Scenarios & Testing *(mandatory)*

This feature has no external end users. The "users" of this feature are the developers and automated agents who maintain the application. User stories below are developer journeys, each independently verifiable.

### User Story 1 - No Module Concentrates Unrelated Responsibilities (Priority: P1)

A developer can locate and change a specific behaviour (opening a document, saving, closing, quitting, handling an external file change, routing a menu command, deleting a tree entry) in a dedicated, focused module instead of navigating a single large orchestration module that owns all of it.

**Why this priority**: Every suggestion document identifies the largest orchestration module as the primary maintainability risk. Splitting it is the highest-leverage change; nothing else reduces risk as much.

**Independent Test**: Open the largest orchestration module and verify it now contains only composition and wiring. Each of its former responsibilities (document lifecycle, workspace tree, dialog coordination, external-change handling, menu routing, editor-pool management) lives in its own focused module with its own automated tests.

**Acceptance Scenarios**:

1. **Given** the refactored codebase, **When** a developer opens the largest orchestration module, **Then** it is reduced to roughly a quarter of its former size and contains no business rules beyond wiring and layout.
2. **Given** a named behaviour (save, close, quit, external change, menu command, delete), **When** a developer searches for where it is implemented, **Then** it is found in one focused module, not scattered across a single giant file.
3. **Given** the main-process service layer, **When** a developer looks for a specific concern (file I/O, dialogs, workspace, settings, recent items, window lifecycle), **Then** each concern is implemented and registered in its own module, and the public contract exposed to the interface process is unchanged.
4. **Given** a large decision flow (folder-open, quit-with-dirty, delete-confirmation), **When** a developer reads it, **Then** it is broken into named sub-steps (dirty-check, confirmation, save-or-discard, cleanup) that read as a sequence.

---

### User Story 2 - Decision Logic Is Extractable and Testable (Priority: P1)

A developer can change a decision rule (is this document dirty? what content gets saved? which confirmation appears?) in a small, pure, independently testable unit — without launching the full application and without an end-to-end test harness.

**Why this priority**: The suggestions call out decision trees embedded inside interface-process callbacks that can only be exercised through the full application. Extracting them makes the riskiest logic directly testable and lowers cognitive load.

**Independent Test**: For each extracted decision unit, run its automated tests in isolation (no application harness) and verify every branch is covered.

**Acceptance Scenarios**:

1. **Given** a decision rule that previously lived inside a large callback (dirty-state check, content-to-save choice, close/quit decision, save-result loop), **When** a developer changes it, **Then** they change a dedicated pure unit and its focused tests, not the large module.
2. **Given** any extracted decision unit, **When** its automated tests run, **Then** they run without the application runtime and cover the unit's branch outcomes directly.
3. **Given** the interface-process state-transition logic, **When** a developer reviews it, **Then** transitions remain side-effect-free and pure; side effects stay confined to the orchestration layer.

---

### User Story 3 - User-Visible Behaviour Is Preserved (Priority: P1)

Every behaviour the user can observe behaves exactly as before the refactor: confirmation prompts (including the single-dialog-at-a-time rule), dirty-state handling, atomic saves, external-change auto-reload versus prompt, source/formatted transitions, error messages with scrubbed paths, and layout persistence.

**Why this priority**: The suggestions are explicit that this is a structural refactor, not a behavioural one. Preserving behaviour is a non-negotiable requirement (constitution Principles I, II, III, IV); losing it would be a regression the user cannot tolerate.

**Independent Test**: Run the full existing automated test suite (unit and application-level) before and after the refactor; the after-run must pass identically.

**Acceptance Scenarios**:

1. **Given** a document with unsaved edits, **When** the user tries to close the tab, close the window, or quit, **Then** the same confirmation prompt appears, naming the affected files, exactly as before.
2. **Given** a file changed or deleted outside the application, **When** the event is observed, **Then** the same auto-reload or prompt behaviour occurs as before, respecting the single-dialog-at-a-time rule.
3. **Given** a save failure, **When** the save completes unsuccessfully, **Then** the document stays flagged as having unsaved changes and the failure is surfaced, exactly as before.
4. **Given** any error the interface process sees, **When** the message is shown, **Then** it contains no absolute file paths outside the workspace root, exactly as before.
5. **Given** the refactored application, **When** all pre-existing automated tests run, **Then** they pass without modification except where test layout is intentionally mirrored to production structure.

---

### User Story 4 - Automated Tests Mirror Production Structure (Priority: P2)

A developer can find the tests for any production module by following the same path; oversized test suites are split by concern, and shared test utilities are centralised.

**Why this priority**: The test tree currently mirrors the two largest problems: oversized files that mirror oversized modules, and duplicated setup. Restructuring tests keeps the safety net maintainable as the codebase grows.

**Independent Test**: For any named production module, find its test file at the mirrored path and verify it stays under the agreed size bound and uses shared utilities rather than duplicated setup.

**Acceptance Scenarios**:

1. **Given** an oversized automated test file, **When** a developer opens it, **Then** it has been split into focused files grouped by concern, each with a clearly named purpose.
2. **Given** any test that launches the full application, **When** it asserts a low-level unit rule (e.g. an exact dirty-state combination), **Then** it has been moved to a direct unit test rather than duplicated through the application-level suite.
3. **Given** the shared application-level test helpers, **When** a developer writes a new test, **Then** they reuse the shared launch, open-folder, open-file, dialog-stub, and typing helpers instead of copying setup.
4. **Given** a previously untested unit of extracted decision logic, **When** it is extracted, **Then** it ships with focused automated tests in the same change.

---

### User Story 5 - Maintainability Regressions Are Caught Automatically (Priority: P2)

A developer merging a change that grows a module past the agreed size or complexity limits is told automatically before the change lands, rather than relying on code review to notice.

**Why this priority**: Both suggestion documents call for automated guardrails. Without enforcement, the refactor is a one-time event and the codebase silently drifts back to the old shape.

**Independent Test**: Introduce a temporary change that exceeds the limits; verify the automated check flags it before merge.

**Acceptance Scenarios**:

1. **Given** a change that pushes a single source module over the agreed size limit, **When** the change is checked, **Then** the automated check reports the violation.
2. **Given** a change that pushes a single function over the agreed complexity limit, **When** the change is checked, **Then** the automated check reports the violation.
3. **Given** the refactored module set, **When** the size/complexity check runs, **Then** it passes, confirming the refactor met its structural targets.
4. **Given** a justifiable exception to the limits, **When** a module exceeds them, **Then** the exception is recorded in the documented decision log rather than silently accepted.

---

### User Story 6 - Documentation Keeps Pace with the Refactor (Priority: P3)

After the refactor, maintainers and automated agents can find a short index of the application's non-negotiable domain policies and the current home of each responsibility, so extractions stay faithful and nobody targets moved code.

**Why this priority**: The suggestions note that agent/spec documentation references old paths and that invariants are restated in comments in many places. A single policy index and updated references prevent future work from undoing the refactor.

**Independent Test**: Read the policy index; for each named invariant and each named responsibility, confirm the referenced location still exists in the codebase.

**Acceptance Scenarios**:

1. **Given** the refactored codebase, **When** a maintainer or agent reads the policy index, **Then** it lists the non-negotiable domain policies (raw-bytes handling, live dirty detection, clean-only eviction, single dialog at a time, two-phase folder open, path scrubbing) and points at where each is enforced.
2. **Given** any documentation that referenced pre-refactor module locations, **When** the refactor moves those modules, **Then** the references are updated in the same change.
3. **Given** a documented invariant, **When** a developer extracts code, **Then** the extraction preserves the invariant and the comment trail identifies it by the same name it had before.

---

### User Story 7 - Stylesheets Are Organized by Area (Priority: P3)

A developer can find the styles for a specific area (chrome, explorer, editor, tabs, status) in a dedicated stylesheet rather than navigating a single large CSS file.

**Why this priority**: `App.css` is 646 lines and growing. Both suggestion documents call out CSS volume as a secondary maintainability risk. Splitting by area keeps styles co-located with the components they style.

**Independent Test**: Open the largest stylesheet and verify it has been split by area, with each area's styles in their own file.

**Acceptance Scenarios**:

1. **Given** the refactored codebase, **When** a developer looks for styles for a specific area, **Then** they find them in a dedicated file named for that area.
2. **Given** the refactored codebase, **When** the stylesheets are measured, **Then** no single stylesheet exceeds the agreed size limit.
3. **Given** a component that is moved or renamed during the refactor, **When** its styles are affected, **Then** the styles are updated or moved in the same change.

---

### User Story 8 - No Circular Dependencies or Dead Code (Priority: P2)

A developer can trust that the module graph has no circular imports and that all imports, types, and exports are used.

**Why this priority**: Splitting a large module into many smaller ones creates a real risk of circular imports and leftover dead code. Without enforcement, the refactor leaves the codebase tangled or cluttered.

**Independent Test**: Run the circular dependency check and dead code check; verify both pass on the refactored codebase.

**Acceptance Scenarios**:

1. **Given** the refactored module set, **When** the circular dependency check runs, **Then** it reports no cycles.
2. **Given** the refactored codebase, **When** the dead code check runs, **Then** it reports no unused imports, types, or exports.
3. **Given** a new change that introduces a circular import, **When** the check runs, **Then** it flags the cycle before merge.

---

### Edge Cases

- What if a module is so cohesive that forcing it under the size limit would reduce clarity? The size limit is a soft target with a documented exception process; a cohesive module may exceed it only with a recorded justification (US5 scenario 4).
- What if the guardrail flags pre-existing modules that were never part of the refactor? The check is scoped to the refactored module set first and extended to the whole codebase only once the refactor completes.
- What if an application-level test depends on selectors that change during a pure refactor? Application-level tests are only rewritten when a flow or selector intentionally changes; otherwise they must stay green as the regression net.
- What if a split test file needs helpers currently defined inside another file? Shared test utilities are centralised as part of the test restructure (US4 scenario 3), so no suite depends on another suite's internals.
- What if extracting decision logic changes the timing of a debounced dirty check? The extraction must preserve the observable timing; behavioural equivalence is covered by US3 acceptance scenario 5.
- What if two suggestion documents disagree on a detail (e.g. exact size limits)? The tighter, more conservative bound applies, and the difference is recorded in the decision log.
- What if a split leaves a module that is small but still mixes responsibilities? Splitting is by responsibility, not just by size; a small mixed-responsibility module is still split.
- What if a stylesheet is so cohesive that splitting it reduces clarity? The stylesheet size limit is a soft target with the same documented exception process as source modules (US5 scenario 4).
- What if the circular dependency check flags a pre-existing cycle that was never part of the refactor? All pre-existing cycles MUST be resolved as part of the refactor; the check is not scoped to newly-introduced cycles.
- What if a type in shared/ is consumed by only one side but is "likely to be" consumed by both in the future? Move it to the side that consumes it now; it can be promoted to shared/ later when the second consumer arrives.
- What if the dead code check flags a type that is re-exported for external consumers? The preload API is the only external surface; if a type is not part of the preload contract or consumed by both main and renderer, it is dead.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The largest orchestration module in the interface process MUST be reduced to a composition layer containing wiring and layout only, with all former responsibilities moved to dedicated focused modules.
- **FR-002**: The interface process MUST provide dedicated modules for each of: document lifecycle (open/close/save/reload, dirty and live-content checks, baseline, content-to-save), workspace tree (expand/select/open/create/rename/delete/move), dialog coordination (single-dialog guard, pending queues), external file-change handling (auto-reload versus prompt), menu-command routing, and editor-instance pool management (cap and clean-only eviction).
- **FR-003**: Every decision rule that previously lived inside a large callback or a long function body MUST be extracted into a pure, independently testable unit.
- **FR-004**: Large decision flows (folder open, quit-with-dirty, delete confirmation) MUST be decomposed into named sub-steps.
- **FR-005**: The main-process service layer MUST be organised so that each concern (file I/O, dialog wiring, workspace lifecycle, settings, recent items, window/quit lifecycle) is implemented and registered in its own module, while the public contract exposed to the interface process MUST remain unchanged.
- **FR-006**: The interface process state-transition logic MUST remain side-effect-free; side effects MUST stay confined to the orchestration layer.
- **FR-007**: The refactor MUST preserve all user-visible behaviour, including confirmation prompts and the single-dialog-at-a-time rule, dirty-state handling, atomic saves and save-failure surfacing, external-change handling, source/formatted transitions, error messages with scrubbed paths, and layout persistence.
- **FR-008**: Every pre-existing automated test MUST continue to pass after the refactor, except where a test is intentionally restructured to mirror production layout.
- **FR-009**: Oversized automated test files MUST be split by concern, with shared test utilities centralised rather than duplicated.
- **FR-010**: Application-level tests MUST not duplicate low-level unit assertions; low-level rules MUST be covered by direct unit tests.
- **FR-011**: Every extracted decision unit MUST ship with focused automated tests covering its branches, in the same change.
- **FR-012**: An automated check MUST flag any source module or function that exceeds the agreed size and complexity limits before a change lands.
- **FR-013**: A single index of non-negotiable domain policies MUST exist and list where each policy is enforced.
- **FR-014**: Documentation references to module locations MUST be updated in the same change that moves the module.
- **FR-015**: The security invariants MUST be preserved and their adversarial tests MUST remain green: path containment, path scrubbing from interface-visible errors, atomic writes, and process isolation.
- **FR-016**: Stylesheets MUST be organized by area (chrome, explorer, editor, tabs, status) when they exceed the agreed size limit, with each area's styles co-located with the components they style.
- **FR-017**: The refactor MUST remove all unused imports, types, and exports introduced by the restructuring. No dead code MAY remain after the refactor.
- **FR-018**: The refactored module set MUST have no circular import dependencies. An automated check MUST flag any new circular import before a change lands.
- **FR-019**: Reducer action handlers MUST be extracted into per-action-type helper functions so each case body stays short and independently testable.
- **FR-020**: Long conditional chains producing per-kind outputs (e.g. per-dialog-kind messages) MUST be converted to lookup maps keyed by the discriminating field.
- **FR-021**: The preload script MUST remain a thin typed bridge with no business logic after the refactor; its public surface MUST be audited and verified unchanged.
- **FR-022**: The shared/ directory MUST NOT grow to include main-only or renderer-only types. Every type in shared/ MUST be consumed by both main and renderer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the refactor, no source module in the codebase exceeds 500 lines, and no orchestration module exceeds 300 lines, as verified by the automated check in 100% of runs.
- **SC-002**: The largest interface-process orchestration module is reduced to no more than a quarter of its pre-refactor size.
- **SC-003**: 100% of automated tests that existed before the refactor pass after it, demonstrating behavioural equivalence.
- **SC-004**: In 100% of cases, a named behaviour (save, close, quit, external change, menu command, delete) can be located in a single focused module.
- **SC-005**: Every extracted decision unit has direct automated tests covering its branches in 100% of cases.
- **SC-006**: The automated guardrail detects a module or function exceeding the agreed limits in 100% of trial runs, and reports no false violations on the refactored codebase.
- **SC-007**: The domain-policy index exists, and 100% of its referenced locations resolve to real code in the refactored codebase.
- **SC-008**: After the refactor, no stylesheet exceeds 400 lines, as verified by the automated check in 100% of runs.
- **SC-009**: The circular dependency check reports zero cycles in the refactored codebase in 100% of runs.
- **SC-010**: The dead code check reports zero unused imports, types, or exports in the refactored codebase in 100% of runs.
- **SC-011**: The preload script's public surface is unchanged after the refactor, as verified by the IPC contract tests.

## Assumptions

- The full scope of the refactor is the complete set of suggestions in the two reference assets (17 suggestions in the maintainability document, 27 in the suggested-changes document). The plan orders the work; the spec does not prioritise between them beyond the user stories above.
- This feature is purely structural. No user-visible behaviour change, new feature, or bug fix is in scope; behavioural equivalence is the requirement (FR-007).
- No global state-management library will be introduced. Both reference documents prefer dedicated focused modules first; a store is only considered if module composition proves inadequate, and that decision would be recorded before proceeding.
- The maintainability limits follow the tighter bound where the two documents differ: no single function above the smaller suggested complexity threshold, and no module above the smaller suggested line bound.
- The automated guardrail starts as a reporting check; escalating violations to block merges is a planning decision, not assumed here.
- The editor-rendering boundary and the central contract types are treated as fixed surfaces; only the surrounding orchestration is refactored.
- The domain-policy index may reference existing specification documents rather than restating their content.
- Test restructuring may re-home or split existing test files but MUST NOT delete test coverage; every covered rule remains covered after the change.
- The CSS split follows component boundaries (chrome, explorer, editor, tabs, status) rather than arbitrary line-count targets; the size limit is a guardrail, not the primary organizer.
- Circular dependency detection starts as a reporting check; escalating violations to block merges is a planning decision, not assumed here.
- Dead code detection uses existing tooling (e.g. TypeScript's `noUnusedLocals`, ESLint's `no-unused-vars`); no new tooling is assumed beyond what the plan selects.
- The preload audit is a verification step, not a refactoring step; the preload script is not expected to change structurally.

## Clarifications

None at specification time. All unspecified details in the reference assets had reasonable defaults recorded above; anything the planning step needs to re-decide will be captured in the plan's decision log.
