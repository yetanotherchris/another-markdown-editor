# Tasks: Frontmatter Handling

**Input**: Design documents from `/specs/021-frontmatter-handling/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for this feature — the constitution mandates
round-trip tests (Principle V) and AGENTS.md requires Playwright e2e specs for
every user-visible feature phase.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Renderer code: `src/renderer/`, tests: `tests/renderer/`, e2e: `tests/e2e/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Test fixtures for frontmatter round-trip characterization

- [X] T001 [P] Add frontmatter fixture files to tests/fixtures/roundtrip/ (frontmatter.md with a YAML block + body, frontmatter-nested.md with nested lists/maps, frontmatter-no-closing.md with `---` and no closing delimiter, frontmatter-crlf.md with CRLF line endings)
- [X] T002 [P] Create the implementation branch 021-frontmatter-handling from clean main before any source work begins

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure split/join module every user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create src/renderer/domain/frontmatter.ts exporting `splitFrontmatter(text)` and `joinFrontmatter(frontmatter, body)` per contracts/frontmatter.md (byte partition: `frontmatter + body === text`; exact `---` delimiter lines; only first-line-opening blocks; CRLF tolerated; no YAML parsing)
- [X] T004 Write tests/renderer/frontmatter.test.ts covering every row of the split/join behaviour contract in contracts/frontmatter.md: plain, no-frontmatter, unclosed, empty frontmatter, no-trailing-newline, CRLF, and the byte-partition invariant `joinFrontmatter(...splitFrontmatter(t)) === t`

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Open file with frontmatter in visual editor (Priority: P1) 🎯 MVP

**Goal**: The visual editor displays only the body; frontmatter is hidden and stored in document state.

**Independent Test**: Open a `---`-delimited file; the visual editor shows only the body with no thematic breaks, bullet lists, or raw YAML.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T005 [P] [US1] Add reducer test file tests/renderer/documents.frontmatter.test.ts asserting OPEN_EXISTING on a frontmatter payload stores `frontmatter` separately and `content` = body only (FR-001/FR-002/FR-003/FR-004)
- [X] T006 [P] [US1] Add e2e spec tests/e2e/frontmatter.spec.ts with a US1 scenario: open a file with frontmatter + nested YAML, assert only body text is visible in the editor and no `---`/YAML text appears

### Implementation for User Story 1

- [X] T007 [US1] Add `frontmatter: string` to `DocumentState` and to `createEmpty`/`openFile` in src/renderer/state/documents.ts (openFile splits the raw bytes via `splitFrontmatter`, storing `content` = body, `baseline` = raw full text)

**Checkpoint**: A file with frontmatter opens with only the body visible in the visual editor.

---

## Phase 4: User Story 2 - Save a file that has frontmatter (Priority: P1)

**Goal**: Saving recombines the stored frontmatter with the current body; no-edit saves are byte-identical; no-frontmatter files gain no block.

**Independent Test**: Edit a body and save; the saved file contains the original frontmatter followed by the edited body.

### Tests for User Story 2 ⚠️

- [X] T008 [P] [US2] Add tests in tests/renderer/documents.frontmatter.test.ts for SAVE_SUCCESS on a frontmatter document: re-splits the written text, preserves frontmatter, clears dirty, baseline = written text (FR-005/FR-008)
- [X] T009 [P] [US2] Add tests in tests/renderer/documents.frontmatter.test.ts asserting `getContentToSave` recombines frontmatter + body for source view, clean formatted, and dirty formatted; and returns body unchanged when frontmatter is `''` (FR-010)
- [X] T010 [P] [US2] Add e2e scenarios in tests/e2e/frontmatter.spec.ts: (a) edit body, save, file = original frontmatter + edited body; (b) no-edit save is byte-identical to the original; (c) no-frontmatter file saves without an added block

### Implementation for User Story 2

- [X] T011 [US2] Update `getContentToSave` in src/renderer/domain/dirty.ts to return `joinFrontmatter(frontmatter, body)` for source view, clean formatted, and dirty formatted per research R5
- [X] T012 [US2] Update `handleSaveSuccess` in src/renderer/state/documents.ts to re-split the written full text (frontmatter + body) so store and disk stay in sync
- [X] T013 [P] [US2] Add reducer test for `handleReload` in tests/renderer/documents.frontmatter.test.ts: a re-read full file with frontmatter re-splits into frontmatter + body and resets baseline/dirty
- [X] T014 [US2] Update `handleReload` in src/renderer/state/documents.ts to re-split the re-read full text (frontmatter + body) and reset baseline/dirty/editorBaseline (research R3)

**Checkpoint**: Saving recombines frontmatter + body; byte-identical no-edit round trip; no empty block added.

---

## Phase 5: User Story 3 - View and edit frontmatter in source mode (Priority: P2)

**Goal**: Source view shows the full file; frontmatter edits there survive view switches and are preserved on save.

**Independent Test**: Open, switch to source, verify frontmatter at top, edit it, switch back, save, verify updated frontmatter.

### Tests for User Story 3 ⚠️

- [X] T015 [P] [US3] Add reducer tests in tests/renderer/documents.frontmatter.test.ts for UPDATE_CONTENT in source view: re-splits the full textarea value into frontmatter + body and sets dirty against the full-file baseline; and for REFRESH_FROM_SOURCE: re-splits full recombined text (FR-007)
- [X] T016 [P] [US3] Add e2e scenarios in tests/e2e/frontmatter.spec.ts: (a) source view shows frontmatter at top; (b) edit frontmatter, return, save → preserved; (c) add a frontmatter block in source to a plain file, return, save → block present; (d) remove the frontmatter block, return, save → no block on disk

### Implementation for User Story 3

- [X] T017 [US3] Update `handleUpdateContent` in src/renderer/state/documents.ts so the source-view branch re-splits the payload via `splitFrontmatter` and sets dirty = `joinFrontmatter(...) !== baseline`
- [X] T018 [US3] Update `handleRefreshFromSource` in src/renderer/state/documents.ts to re-split the full recombined text (frontmatter + body)
- [X] T019 [US3] Update `EditorPanel` in src/renderer/editor/EditorPanel.tsx to pass `joinFrontmatter(document.frontmatter, document.content)` to `SourceView`
- [X] T020 [US3] Update `handleReturnToFormatted` in src/renderer/hooks/useSourceViewToggle.ts to dispatch `REFRESH_FROM_SOURCE` with the full recombined text so frontmatter edits survive the remount

**Checkpoint**: Source view shows and edits the full file; frontmatter edits survive view switches and saving.

---

## Phase 6: User Story 4 - Round-trip fidelity of frontmatter (Priority: P2)

**Goal**: Byte-identical frontmatter round trip, including comments, custom formatting, and quoted strings.

**Independent Test**: Open a file with complex frontmatter, save without editing, diff against the original.

### Tests for User Story 4 ⚠️

- [X] T021 [P] [US4] Extend tests/renderer/roundtrip.test.ts (or documents.frontmatter.test.ts) to load the new frontmatter fixtures and assert `content` = body, `baseline` = raw full text, `dirty` = false
- [X] T022 [P] [US4] Add e2e scenario in tests/e2e/frontmatter.spec.ts: open a file with complex frontmatter (comments, quoted strings, custom indentation), save without editing, assert the on-disk bytes equal the original file bytes

### Implementation for User Story 4

- [X] T023 [US4] Verify round-trip through the store: extend/review tests that OPEN_EXISTING → SAVE_SUCCESS (no edits) keeps `baseline === saved text` and dirty false for the frontmatter fixtures (no source code change expected beyond T007/T012; fix any store bug surfaced)

**Checkpoint**: Complex frontmatter round-trips byte-identically with no edits.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Full validation, spec archive, and status-table update

- [X] T024 [P] Run `npm run lint`, `npm run typecheck`, and `npm run test` — all must pass
- [X] T025 [P] Run `npm run test:e2e` (build + Playwright) — full suite must pass including the new frontmatter spec
- [X] T026 Archive the implemented spec: `git mv specs/021-frontmatter-handling specs/archive/021-frontmatter-handling`, set its **Status** to `Archived`, and update the Current implementation status table in AGENTS.md
- [X] T027 Open the phase PR against main with the changes, PR description ending with the AI usage line

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — fixtures only
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational completion; run in priority order (P1 → P2 → P3)
- **Polish (Phase 7)**: Depends on all user stories

### User Story Dependencies

- **User Story 1 (P1)**: split/join (Phase 2) + `DocumentState.frontmatter`
- **User Story 2 (P1)**: `content`/`frontmatter` already split (US1) + `getContentToSave`
- **User Story 3 (P2)**: depends on US1 (split on open) and the source-view store path; independent of US2
- **User Story 4 (P2)**: depends on US1/US2 (split on open + save recombination)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Pure domain / reducer logic before editor wiring
- Story complete before moving to next priority

### Parallel Opportunities

- T001/T002 (Setup) in parallel
- T003/T004 sequential (module then its tests)
- Test tasks within a story ([P]) in parallel before implementation
- US1→US2→US3→US4 sequential by priority; test files are shared (documents.frontmatter.test.ts, frontmatter.spec.ts) so story tasks touch overlapping files and run sequentially

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (fixtures)
2. Complete Phase 2: Foundational (split/join)
3. Complete Phase 3: User Story 1 — open with only body visible
4. **STOP and VALIDATE**: run the US1 reducer + e2e tests

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Test independently (MVP)
3. Add US2 → Test independently (save recombine)
4. Add US3 → Test independently (source view)
5. Add US4 → Test independently (round-trip fidelity)
6. Polish → full lint/typecheck/unit/e2e gate, archive spec, PR

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
