# Tasks: Dictionary Coverage

**Input**: Design documents from `/specs/025-dictionary-coverage/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED — AGENTS.md requires Playwright e2e specs for every
user-visible feature phase. Here the existing `tests/e2e/spellcheck.spec.ts` is
the regression gate; unit tests cover the new supplemental behaviour.

**Organization**: Tasks are grouped by phase.

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Renderer code: `src/renderer/`, tests: `tests/renderer/`, e2e: `tests/e2e/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The branch and the upgraded dictionary assets

- [ ] T001 Create the implementation branch `phase-025-dictionary-upgrade` from clean main before any source work begins
- [ ] T002 Replace src/renderer/assets/dictionaries/en-gb.aff and en-gb.dic with the en_GB-large files from the SCOWL/ESDB 2026.02.25 release (same filenames, size-70 content)
- [ ] T003 Replace src/renderer/assets/dictionaries/en-us.aff and en-us.dic with the en_US-large files from the SCOWL/ESDB 2026.02.25 release (same filenames, size-70 content)
- [ ] T004 Add src/renderer/assets/dictionaries/README.md recording provenance (ESDB 2026.02.25, size-70) and the SCOWL/ESDB + BSD-affix license terms (attribution)
- [ ] T005 Add src/renderer/assets/dictionaries/supplemental-words.txt with the curated list (one lowercase word per line): json, lacanian, kleinian, psychodynamic, hominem, reproduceable, experimentations, maladaptive

---

## Phase 2: Implementation (Blocking Prerequisites)

**Purpose**: Wire the supplemental list into the pure checker

- [ ] T006 Import supplemental-words.txt `?raw` in src/renderer/domain/spellcheck.ts, parse it into a lowercased `ReadonlySet<string>` exported as `SUPPLEMENTAL_WORDS`
- [ ] T007 Extend `findMisspellings` in src/renderer/domain/spellcheck.ts to skip tokens whose lowercase form is in `SUPPLEMENTAL_WORDS` (alongside the existing `customWords` skip); no signature change

---

## Phase 3: Verification (User Stories)

**Purpose**: Prove US1 (report words not flagged) and US2 (no regression)

- [ ] T008 Add a unit-test block to tests/renderer/spellcheck.test.ts asserting each report word (json, lacanian, kleinian, psychodynamic, hominem, reproduceable, experimentations, maladaptive) yields no misspelling in BOTH en-GB and en-US, including case variants (JSON / Json / json)
- [ ] T009 Confirm the unchanged tests/renderer/spellcheck.test.ts cases still pass with the size-70 dictionaries (British/American split, typo fixtures)
- [ ] T010 Run `npm run test`, `npm run lint`, `npm run typecheck`, `npm run check` — all green
- [ ] T011 Run `npm run test:e2e` — the existing spellcheck e2e suite passes unchanged

---

## Phase 4: Polish

**Purpose**: Archive the spec and ship

- [ ] T012 Move specs/025-dictionary-coverage to specs/archive/025-dictionary-coverage (git mv), set `**Status**: Archived`
- [ ] T013 Open the phase PR against main with the AI usage line
