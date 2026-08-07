# Tasks: Rename Application to MarkdownMeister

**Feature**: `019-rename-to-markdownmeister` | **Date**: 2026-08-08

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/rename.md](./contracts/rename.md), [quickstart.md](./quickstart.md)

**Implementation strategy**: The rename is one mechanical change driven by the
naming map in `contracts/rename.md`. Order: package identity and build config
(the source of truth for the packaged names) first, then the release pipeline,
then source identifiers, then docs/specs, then the gates. The repo URL
(`github.com/yetanotherchris/another-markdown-editor`) is deliberately NOT
renamed wherever it names the repository (contract Table: Strings that MUST NOT
change).

---

## Phase 1: Setup (Package Identity)

- [ ] T001 Change `name` to `markdownmeister` and `productName` to
      `MarkdownMeister` in `package.json` (contract row 1-2; FR-004/FR-003).
- [ ] T002 Regenerate `package-lock.json` so its root `name` matches the new
      `package.json` — run `npm install --package-lock-only --ignore-scripts`
      (contract row 1; spec Assumptions).

**Checkpoint**: package identity renamed; the lockfile agrees with `package.json`.

---

## Phase 2: Foundational (Build Identity + Window Title)

- [ ] T003 [P] Update `electron-builder.yml`: `appId: com.yetanotherchris.markdownmeister`,
      `productName: MarkdownMeister`, `executableName: markdownmeister`,
      `artifactName: markdownmeister-${version}-<os>-${arch}.${ext}` for the
      `win`/`mac`/`linux` blocks, `files` exclude
      `!another-markdown-editor.json` → `!markdownmeister.json`, and update the
      spec-009 comments (contract rows 3-4, 8-10, 28; FR-001/002/005/006).
- [ ] T004 [P] Change the `<title>` to `MarkdownMeister` in
      `src/renderer/index.html` (contract row 5; FR-010).

**Checkpoint**: build identity sources renamed; a build now produces
`markdownmeister`-named output and a `MarkdownMeister` window title.

---

## Phase 3: User Story 1 - Visible Name (Priority: P1)

**Goal**: Every user-visible surface (window title bar, taskbar tooltip, macOS
menu, HTML title) reads "MarkdownMeister".

**Independent Test**: `npx playwright test tests/e2e/rename.spec.ts` against the
built app; plus visual confirmation of the packaged window/taskbar label.

### Test for User Story 1

- [ ] T005 [US1] Add `tests/e2e/rename.spec.ts` asserting the built app's window
      `document.title` is `MarkdownMeister` (US1 acceptance scenarios; FR-001/010).

### Implementation for User Story 1

- [ ] T006 [US1] Run `npx playwright test tests/e2e/rename.spec.ts` and confirm
      the title assertion passes against the renamed build.

**Checkpoint**: User Story 1 verified — the app self-identifies as MarkdownMeister.

---

## Phase 4: User Stories 2 + 5 - Binary and Release Pipeline (Priority: P1/P2)

**Goal**: The packaged executable is `markdownmeister`; every release artifact
and the CI/update-scripts that name it use the `markdownmeister` prefix.

**Independent Test**: grep the workflow, scripts, and manifests for `ameditor`
(expect zero); inspect `electron-builder.yml` artifact names.

- [ ] T007 Update `.github/workflows/build-release.yml`: the upload globs
      `dist/ameditor-*` → `dist/markdownmeister-*`, the seven entries in the
      "Verify required artifact set" step, and the auto-commit
      `file_pattern: another-markdown-editor.json Formula/another-markdown-editor.rb package.json`
      → `markdownmeister.json Formula/markdownmeister.rb package.json`
      (contract rows 11-13; FR-006).
- [ ] T008 Update `updatescoop.ps1`: `$fileName`/`$url` →
      `markdownmeister-$Version-windows-x64.zip`, manifest path →
      `markdownmeister.json`, and the spec-009 comments (contract rows 23-24, 28;
      FR-009).
- [ ] T009 Update `updatebrew.ps1`: the three `$*File` names, the three URL
      replace regexes, the `bin.install` regex (→ `=> "markdownmeister"`), the
      expected-guard array, `$formulaPath` → `Formula/markdownmeister.rb`, and the
      spec-009 comments (contract rows 25-28; FR-009).

**Checkpoint**: the release pipeline emits and verifies `markdownmeister` names.

---

## Phase 5: User Story 3 - Package Definitions (Priority: P2)

**Goal**: Scoop and Homebrew install `markdownmeister` from renamed manifest and
formula files.

**Independent Test**: `scoop install markdownmeister` and
`brew install yetanotherchris/tap/markdownmeister` against the next release.

- [ ] T010 Rename `another-markdown-editor.json` → `markdownmeister.json`
      (`git mv`); update the download `url` to
      `markdownmeister-0.0.96-windows-x64.zip` and `bin` to
      `["markdownmeister.exe", "markdownmeister"]` (keep `homepage` = repo URL and
      the `0.0.96` version/hash — R4) (contract rows 14-16; FR-007).
- [ ] T011 Rename `Formula/another-markdown-editor.rb` → `Formula/markdownmeister.rb`
      (`git mv`); update the class to `Markdownmeister`, the three per-arch URLs to
      `markdownmeister-0.0.96-…`, `odie` message to "MarkdownMeister…", `app.install`
      to `MarkdownMeister.app`, `bin.install` to `bin/markdownmeister`, and the
      `test` assertions (keep `homepage` = repo URL and the version/hashes — R4)
      (contract rows 17-22; FR-008).

**Checkpoint**: both package definitions install the renamed product.

---

## Phase 6: User Story 4 - Source Identifiers (Priority: P2)

**Goal**: No old-name reference remains in source identifiers, CSS tokens, test
seams, temp prefixes, or the on-disk config folder (full cleanup, plan Decision
log 2026-08-08).

**Independent Test**: the SC-002 greps in quickstart.md (zero matches for the
literal strings outside the repo URL, archives, and build output).

- [ ] T012 [P] Rename the test seams in `src/main/index.ts` and
      `tests/e2e/launch.ts` and the comment in `playwright.config.ts`:
      `AME_USER_DATA_DIR` → `MM_USER_DATA_DIR`, `AME_E2E_HEADED` →
      `MM_E2E_HEADED`, `AME_CONFIG_DIR` → `MM_CONFIG_DIR` (contract rows 29-31).
- [ ] T013 [P] Update `src/main/recentItemsPath.ts` (`appData/ame` →
      `appData/markdownmeister`, `AME_CONFIG_DIR` → `MM_CONFIG_DIR`, comments)
      and the seam reference in `src/main/settings.ts` (contract rows 6, 30).
- [ ] T014 [P] Rename the CSS design tokens `--ame-*` → `--mm-*` in
      `src/renderer/**/*.css` and the token references in
      `tests/e2e/{theme,source,header-bar-shade}.spec.ts` (contract row 32).
- [ ] T015 [P] Rename `.ame-spelling-error` → `.mm-spelling-error` and the
      `PluginKey('ame-spellcheck')` → `'mm-spellcheck'` in
      `src/renderer/editor/{editor.css,spellcheckPlugin.ts}` and
      `tests/e2e/spellcheck.spec.ts` (contract rows 33-34).
- [ ] T016 [P] Rename the `'ame-…'` temp-dir prefixes → `'mm-…'` in
      `tests/main/**`, `tests/renderer/**`, and `tests/e2e/**` (contract row 35).
- [ ] T017 [P] Update the `appData/ame` comments in
      `src/main/{settingsFile.ts,windowStateFile.ts,recentItems.ts,spellcheckDictionary.ts}`
      (contract row 6).

**Checkpoint**: no `AME_`, `--ame-`, `ame-spelling-error`, `'ame-`, or
`appData/ame` reference remains in `src/` or `tests/`.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T018 Update `README.md`: title, `brew install yetanotherchris/tap/markdownmeister`,
      `scoop bucket add markdownmeister <repo-url>` + `scoop install markdownmeister`,
      and the launch command `markdownmeister` (keep the repo URL in the bucket-add
      command) (contract rows 37; FR-013).
- [ ] T019 Update the `docs/DESIGN_DECISIONS.md` heading to
      `MarkdownMeister — Design Decisions` (keep the repo-URL input line) (contract
      row 36; FR-014).
- [ ] T020 Update `.specify/memory/constitution.md`: title to
      `MarkdownMeister Constitution`, add a PATCH amendment note, bump
      version/last-amended (contract row 38).
- [ ] T021 Update the active specs per FR-015 (contract rows 39-40):
      `specs/006-file-association/spec.md` working name → `markdownmeister`;
      `specs/022-universal-config-path/spec.md` config path →
      `~/.config/markdownmeister/…`, seam `AME_CONFIG_DIR` → `MM_CONFIG_DIR`,
      migration sources `…/ame/…` → `…/markdownmeister/…`, plus a dated
      `## Clarifications` entry recording the change (plan Decision log
      2026-08-08).
- [ ] T022 Run the gates and fix anything they catch: `npm run lint`, `npm run
      typecheck`, `npm run test`, `npm run test:e2e` (SC-006).
- [ ] T023 Run the SC-002 verification greps from quickstart.md and confirm the
      only remaining matches are the GitHub repo URL (documented exception) plus
      archived specs / build output / lockfile contents.
- [ ] T024 Archive the feature: `git mv specs/019-rename-to-markdownmeister
      specs/archive/019-rename-to-markdownmeister`, set the spec's **Status** to
      `Archived`, and update the row for 019 in `AGENTS.md` (Current
      implementation status) to `Archived` / `Complete`.

**Checkpoint**: all gates green; zero stray old-name references; spec archived.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 before T002.
- **Foundational (Phase 2)**: independent of Phase 1; T003/T004 can run in
  parallel.
- **US1 (Phase 3)**: T005 after T004 (needs the renamed title); T006 after T005.
- **US2+US5 (Phase 4)**: independent of US1; T007-T009 in any order.
- **US3 (Phase 5)**: T010/T011 after the electron-builder names (T003) — the
  manifests must agree with the artifact names.
- **US4 (Phase 6)**: T012-T017 all independent (different files), any order.
- **Polish (Phase 7)**: T018-T021 in any order; T022 after T001-T021; T023 after
  T022; T024 last.

### Parallel Opportunities

- T003/T004 (Phase 2) and T007-T009 (Phase 4) and T010/T011 (Phase 5) touch
  disjoint files and can run together.
- T012-T017 (Phase 6) are fully parallel — different files, no shared edits.
- T018-T021 (Phase 7) are fully parallel.

### Within-File Rule

`package.json` (T001), `electron-builder.yml` (T003), and `tests/e2e/rename.spec.ts`
(T005) are each touched once; do not interleave edits to the same file.

---

## Implementation Strategy

1. Rename package identity + build config (Phases 1-2) — produces the correct
   names everywhere downstream reads them.
2. Add the US1 e2e title test and the release pipeline + manifests (Phases 3-5).
3. Rename source identifiers (Phase 6).
4. Docs, active specs, constitution (Phase 7).
5. Run all gates, verify zero references, archive the spec.
