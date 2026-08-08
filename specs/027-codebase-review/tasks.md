# Tasks: Codebase Reliability and Maintainability Hardening

## Phase 1: Contracts and safe foundations

- [ ] T001 Add runtime-safe shared IPC request validators and ensure every channel maps unknown errors to declared error codes.
- [ ] T002 Add approved-origin, navigation, popup, and sender authorization rules without adding a generic IPC escape hatch.
- [ ] T003 Replace process-global window registration with current-window lifecycle registration and reset lifecycle state on recreation.
- [ ] T004 Add unit and integration tests for malformed requests, unauthorized senders, navigation, popup denial, and recreated windows.

## Phase 2: Filesystem and save safety

- [ ] T005 Refactor all workspace filesystem operations to use an operation-bound validated target or documented race-resistant primitive.
- [ ] T006 Verify prepared workspace identity at commit and preserve the existing workspace on replacement.
- [ ] T007 Consolidate all atomic writes, guarantee descriptor cleanup, preserve destinations on injected failures, and document durability limits.
- [ ] T008 Add adversarial path replacement, atomic-write failure, typed-error, and sanitized-message tests for every affected operation.
- [ ] T009 Add document revision tokens and stale-completion protection to save orchestration and reducer state.
- [ ] T010 Add out-of-order save, edit-during-save, and failed-save regression tests.

## Phase 3: Typed state and lifecycle behavior

- [ ] T011 Replace renderer reducer `any` payloads and assertions with discriminated action unions and deterministic time inputs.
- [ ] T012 Enforce the editor instance cap after tab creation and verify safe reactivation; define and test dirty-tab behavior.
- [ ] T013 Replace the single external-change slot with a lossless queue or deterministic coalescing model and ignore stale workspace events.
- [ ] T014 Wire explorer API references so activation reveals collapsed ancestors and clears selection for untitled/external documents.
- [ ] T015 Make editor initialization cancellation-safe and add lifecycle tests.
- [ ] T016 Surface renderer read and settings persistence failures without losing current state.

## Phase 4: Accessibility and quality gates

- [ ] T017 Implement keyboard-complete tab and context/spelling menu behavior with focus restoration and accessible state.
- [ ] T018 Add e2e coverage for editor retention, reveal behavior, keyboard flows, failure messages, and settings failure behavior.
- [ ] T019 Make e2e startup/teardown bounded and visible, isolate workspace/configuration per test, and replace fixed sleeps with observable synchronization where feasible.
- [ ] T020 Add formatting, source-scope lint, runtime version, dependency hygiene, and truthful maintainability gates; update CI to run all required checks.

## Phase 5: Review and completion

- [ ] T021 Run the complete unit, e2e, lint, typecheck, build, formatting, audit, and maintainability checks.
- [ ] T022 Launch independent security, architecture, frontend, test, and build reviews against the final diff; resolve P0/P1 findings.
- [ ] T023 Update this task list and any living research/plan decisions for deviations, then archive the spec when the implementation is complete.
