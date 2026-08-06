# Tasks: Codebase Refactor

**Feature**: `017-codebase-refactor` | **Date**: 2026-08-06

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/renderer.md](./contracts/renderer.md),
[contracts/main.md](./contracts/main.md), [contracts/guardrails.md](./contracts/guardrails.md)

**Implementation strategy**: pure, low-risk extractions first (domain functions,
reducer case helpers, `messagesFor` map, guardrail script) so the risky module
splits that follow are measured against stable unit tests. Then the two big
splits — App.tsx into nine hooks (US1 renderer) and handlers.ts into six
handler modules (US1 main) — each preserving behaviour exactly. Then decision
flow decomposition (US2), the behavioural-equivalence gate (US3), the test
restructure (US4), the guardrails green (US5/US8), the stylesheet split (US7),
documentation (US6), and archive. Everything is validated with `npm run lint`,
`npm run typecheck`, `npm run test`, `npm run test:e2e`, and `npm run check`.

**Critical safety rule**: this is a *structural* refactor. No handler body is
rewritten while relocating — code is moved verbatim and only imports/wiring
change. If a test fails after a move, the move broke behaviour; fix the move,
never the test (US3, constitution Principle V).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the branch baseline before any change.

- [X] T001 Establish a green baseline on the `017-codebase-refactor` branch
      (created from clean `main` per AGENTS.md): run `npm run lint`,
      `npm run typecheck`, `npm run test` (expect 307 passing), and confirm the
      e2e suite passes (`npm run test:e2e`). Record results here. Confirm the
      artifacts (`spec.md`, `plan.md`, `research.md`, `data-model.md`,
      `contracts/*`, `quickstart.md`) are present and consistent.
      — Baseline recorded 2026-08-06: lint clean, typecheck clean, unit 307/307.
      e2e 120/121 — the single failure (`source.spec.ts` US5 "Backspace removes
      an empty task item") is a pre-existing flake (the test body comments
      "ingest of the typed text and is flaky"); it passes in isolation.

**Checkpoint**: baseline green; artifacts present.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Goal: the pure decision functions, reducer case extraction, the `messagesFor`
map, the guardrail script, and the domain-policy index every later phase builds
on. No orchestration module changes in this phase.**

- [X] T002 Create `src/renderer/domain/dirty.ts`: `getLiveContent(doc,
      getMarkdown)`, `isDirtyLive(doc, getMarkdown)`, `getContentToSave(doc,
      getMarkdown)`, `shouldFlushLive(doc, getMarkdown)` — pure, React-free,
      electron-free, taking the instance-pool markdown accessor as an injected
      parameter. Copy the exact semantics of App.tsx's `getLiveContent` /
      `isDirtyLive` / `getContentToSave` / `flushLiveContent` decision (raw-bytes
      policy: `markdownSame` vs `editorBaseline`; source-view raw-text handling;
      `doc.dirty` gate). (contracts/renderer.md §Pure-function contracts)
- [X] T003 Create `src/renderer/domain/quit.ts`: `dirtyDocumentsToSave(docs,
      isDirty)`, `shouldRePromptForFailedSave(saved)` — the pure cores of the
      quit/close/folder-open save-result loops. (contracts/renderer.md)
- [X] T004 [P] Move `isWorkspaceRelative` from `App.tsx` into
      `src/renderer/explorer/operations.ts` and export it. Update the App.tsx
      import (App.tsx is still the monolith at this point — only the import
      line changes).
- [X] T005 [P] Extract `state/documents.ts` case bodies into exported
      per-action helpers (`handleOpenNew`, `handleOpenExisting`,
      `handleActivateDoc`, `handleUpdateContent`, `handleCaptureBaseline`,
      `handleSaveSuccess`, `handleSaveFailed`, `handleCloseDoc`, `handleEvict`,
      `handleReactivate`, `handleCaptureEditorState`, `handleReload`,
      `handleUpdatePath`, `handleReroutePaths`, `handleExternalChange`,
      `handleSetView`, `handleRefreshFromSource`) and make `documentsReducer` a
      thin switch dispatching to them (FR-019, data-model.md §1.4). Behaviour
      unchanged; existing `tests/renderer/documents.test.ts` must pass as-is.
- [X] T006 [P] Same for `state/workspace.ts`: `handleReplace`,
      `handleExpandStart`, `handleExpandSuccess`, `handleExpandError`,
      `handleSelect`, `handleApplyWatchEvent`, `handleInsertEntry`,
      `handleRemoveEntry`, `handleMoveEntry`; `workspaceReducer` becomes a thin
      switch. Existing `tests/renderer/workspace.test.ts` must pass as-is.
- [X] T007 [P] Convert `messagesFor` in `src/shared/nativeDialog.ts` from the
      per-kind switch producing `{type,message,detail}` into a lookup map
      `Record<NativeDialogRequest['kind'], (req) => {type,message,detail}>`
      (FR-020). The `layoutFor`/`decisionFromResponse`/`cancelDecision` tables
      stay. Existing `tests/renderer/nativeDialog.test.ts` must pass as-is.
- [X] T008 Create `scripts/check-maintainability.mjs` using the TypeScript
      compiler API: size (src modules > 500, orchestration > 300, stylesheets >
      400), function cyclomatic complexity > 15, circular-import cycles, unused
      exports (referenced by nothing in `src/` or `tests/`, excluding the preload
      surface). Wire `"check": "node scripts/check-maintainability.mjs"` in
      `package.json`. Reporting only (exit 0) per spec Assumption. Add
      `tests/main/check-maintainability.test.ts` feeding a synthetic fixture
      tree and asserting each rule fires and a clean fixture reports zero
      (SC-006). (contracts/guardrails.md)
- [X] T009 [P] Create `docs/domain-policies.md`: an index of the non-negotiable
      domain policies (raw-bytes handling, live-dirty detection, clean-only
      eviction, single dialog at a time, two-phase folder open, path scrubbing,
      atomic saves) pointing at where each is enforced, cross-referencing the
      constitution and specs (US6, FR-013). Draft against the planned locations;
      Phase 9 re-verifies each reference resolves.
- [X] T010 [P] Write `tests/renderer/domain/dirty.test.ts` covering every branch
      of the four functions (live/evicted, source view, `doc.dirty`, baseline
      drift, normalized-pristine) with a fake markdown accessor (FR-011).
- [X] T011 [P] Write `tests/renderer/domain/quit.test.ts` covering the two
      helpers (FR-011).

**Checkpoint**: `npm run lint`, `npm run typecheck`, `npm run test` pass; the
pure functions, reducer helpers, lookup map, guardrail script, and policy index
exist with tests. App.tsx and handlers.ts are untouched (except the one import
line in T004).

---

## Phase 3: US1 — No module concentrates unrelated responsibilities (P1)

**Goal**: App.tsx becomes a thin composition root; handlers.ts splits by domain.
Both ends of the IPC boundary become symmetric (FR-001/FR-002/FR-005).

**Independent Test**: US1 acceptance scenarios; the full pre-existing unit + e2e
suite passes unchanged (SC-003). `App.tsx` ≤ 300 lines (SC-002); `handlers.ts`
gone, its channels registered from `handlers/*.ts`.

### Renderer — the hook split

The hooks form one cohesive change (each imports the previous group's returned
API). Create them in dependency order, then rewire App.tsx. Handler bodies are
**moved verbatim** — only the module boundaries change.

- [X] T012 [US1] Create `src/renderer/hooks/useDialogQueue.ts`: owns
      `dialogInFlightRef`, `pendingErrorRef`, `pendingExternalPromptRef`,
      `handleExternalChangeRef`, `showOperationErrorRef`, and returns
      `releaseDialogSurface` (drain external-first-then-error, each re-acquiring
      the guard) and `showOperationError` (show or queue). Wired from the current
      App.tsx `releaseDialogSurface`/`showOperationError` bodies verbatim
      (contracts/renderer.md §useDialogQueue).
- [X] T013 [US1] Create `src/renderer/hooks/useEditorPool.ts`: returns
      `enforcePoolCap(activeId)` — `!instancePool.hasSpace()` →
      `evictLRU(documents.filter(isDirtyLive), activeId)`, then
      `instancePool.remove(evictId)` + `dispatch({ type: 'EVICT', payload: { id:
      evictId } })`. Receives `dispatch`, `sessionRef`, `isDirtyLive`.
      (contracts/renderer.md §useEditorPool)
- [X] T014 [US1] Create `src/renderer/hooks/useDocumentSession.ts`: receives
      `{ dispatch, sessionRef, dialog, isDirtyLive, enforcePoolCap }`; returns
      `saveDocument`, `doClose`, `handleCloseRequest`, `reloadDocument`,
      `handleQuitRequest`, `flushLiveContent`, `handleContentChange`,
      `handleBaselineCapture`, `handleCursorState`, `handleActivate`,
      `handleNew`, `handleOpen`. Binds `domain/dirty.ts` to
      `(id) => instancePool.getMarkdown(id)` for its live checks. Bodies copied
      verbatim from App.tsx (contracts/renderer.md §useDocumentSession).
- [X] T015 [US1] Create `src/renderer/hooks/useSourceViewToggle.ts`: receives
      `{ dispatch, sessionRef, session }`; returns `handleShowSource`,
      `handleReturnToFormatted`, `openPathInSource`, `handleViewSource`
      (spec 002 transitions verbatim).
- [X] T016 [US1] Create `src/renderer/hooks/useWorkspaceTree.ts`: receives
      `{ dispatch, dispatchWorkspace, sessionRef, workspaceRef, dialog, session,
      treeApiRef, pendingCreateRef, createCounterRef }`; returns
      `handleTreeSelect`, `handleTreeActivate`, `handleTreeToggle`, `applyMove`,
      `handleRename`, `handleEditingCancelled`, `handleCreate`,
      `cleanupAfterDelete`, `runDeleteConfirmation`, `handleTreeMove` (bodies
      verbatim, including the delete flow, CONFLICT retry, and clean-to-close
      re-check).
- [X] T017 [US1] Create `src/renderer/hooks/useExternalFileEvents.ts`: receives
      `{ sessionRef, dialog, session }`; returns `handleExternalPrompt` and
      `handleExternalChange`, and sets `dialog.handleExternalChangeRef.current =
      handleExternalChange` each render (so the dialog queue can drain deferred
      notices). Bodies verbatim.
- [X] T018 [US1] Create `src/renderer/hooks/useWorkspaceFolder.ts`: receives
      `{ dispatch, dispatchWorkspace, sessionRef, dialog, session }`; owns
      `pendingFolderOpenRef`; returns `commitFolderOpen`, `runFolderOpenFlow`,
      `dirtyWorkspaceRelativeDocs`, `revealExplorer` (two-phase prepare →
      confirm → commit verbatim).
- [X] T019 [US1] Create `src/renderer/hooks/useSidebarLayout.ts`: receives
      `{ sidebarPanelRef, explorerRestoreDoneRef }`; returns
      `handleSidebarResize`, `handleToggleExplorer` (never-persist-0 rule,
      mount guard, explicit visibility persistence verbatim).
- [X] T020 [US1] Create `src/renderer/hooks/useMenuCommands.ts`: receives the
      session/tree/source/folder APIs + `{ sessionRef, dialog }`; returns
      `handleMenuCommand` — the spec 010 command bus routing every `MenuCommand`
      to the same dispatch paths as today, verbatim.
- [X] T021 [US1] Rewrite `src/renderer/App.tsx` as a thin composition root
      (≤ ~250 lines): own the two `useReducer`s and the shared refs
      (`sessionRef`, `workspaceRef`, `sidebarPanelRef`, `explorerRestoreDoneRef`,
      `treeApiRef`, `pendingCreateRef`, `createCounterRef`), bind
      `isDirtyLive`, call the nine hooks in dependency order, keep the
      window.api subscription effect, the pool-destroy effect, the workspace
      active-file reveal effect, and the existing JSX — with all handlers coming
      from the hooks. No business rules remain inline (FR-001).
- [X] T022 [US1] Thin `src/renderer/explorer/Tree.tsx`: extract the drag/drop
      target logic into `src/renderer/explorer/treeMove.ts` (`treeMoveTarget`,
      `treeWouldMoveIntoOwnDescendant`) and the inline-rename start/cancel flow
      into `src/renderer/explorer/treeRename.ts`; Tree.tsx keeps rendering +
      arborist wiring + context-menu composition. Pure units, no behaviour
      change (suggestion 7/11).

**Checkpoint (renderer)**: `npm run lint`, `npm run typecheck`, `npm run test`
pass; `npm run test:e2e` passes — the renderer split is behaviourally
equivalent. App.tsx ≤ 300 lines.

### Main — the handler split

- [X] T023 [US1] Create `src/main/ipc/handlers/context.ts`: module state
      (`workspaceState`, `workspaceRoot`, `allowClose`) + `ok`/`err`/
      `sanitizeError`/`toAppError`/`ensureString`/`validateKind`/`validateShape`/
      `withWorkspace`/`resolveAbsolutePath` + spec-004 helpers (`isRecentEntry`,
      `recordRecent`, `removeRecent`, `canonicalPath`, `openFileFromPath`),
      moved from handlers.ts verbatim (contracts/main.md §Shared context).
- [X] T024 [P] [US1] Create `src/main/ipc/handlers/files.ts`:
      `registerFileHandlers(window, ctx)` registering `file:openDialog`,
      `file:read`, `file:write`, `file:saveDialog` (bodies verbatim).
- [X] T025 [P] [US1] Create `src/main/ipc/handlers/dialogs.ts`:
      `registerDialogHandlers(window, ctx)` registering `dialog:show` (via
      `validateNativeDialogRequest` + `showNativeConfirmation`).
- [X] T026 [P] [US1] Create `src/main/ipc/handlers/workspace.ts`:
      `registerWorkspaceHandlers(window, ctx)` registering
      `workspace:prepareFolderOpen`, `workspace:commitFolderOpen`,
      `workspace:cancelFolderOpen`, `workspace:readDir` (the two-phase flow with
      the `pendingFolderOpen` guard verbatim).
- [X] T027 [P] [US1] Create `src/main/ipc/handlers/settings.ts`:
      `registerSettingsHandlers(window, ctx)` registering `settings:get`,
      `settings:update`.
- [X] T028 [P] [US1] Create `src/main/ipc/handlers/recent.ts`:
      `registerRecentHandlers(window, ctx)` registering `recent:openFile`,
      `recent:list`, `recent:clear`.
- [X] T029 [P] [US1] Create `src/main/ipc/handlers/app.ts`:
      `registerAppHandlers(window, ctx)` registering `app:requestQuit`,
      `devtools:toggle`, `quit:respond`, and owning `setupWindowCloseHandler` +
      `tryCloseWindow` (the `allowClose` lifecycle).
- [X] T030 [US1] Update `src/main/ipc/register.ts` to call the six
      `register*(window, ctx)` functions under the existing idempotent guard
      (app first — it owns the close handler). Delete `src/main/ipc/handlers.ts`
      (git mv the concern splits; no channel is dropped — FR-005, SC-011).

**Checkpoint (main)**: `npm run lint`, `npm run typecheck`, `npm run test`
pass; `npm run test:e2e` passes; `tests/main/ipc.test.ts` (the contract shape
test) is untouched and green. No channel is added or removed.

---

## Phase 4: US2 — Decision logic is extractable and testable (P1)

**Goal**: large decision flows read as named sub-steps and their decision cores
are pure and unit-tested (FR-003/FR-004, US2).

**Independent Test**: each extracted decision unit runs under Vitest without the
application; every branch is covered (US2 scenarios 1–2).

- [X] T032 [US2] In `src/renderer/hooks/useWorkspaceFolder.ts`, decompose
      `runFolderOpenFlow` into named sub-steps (`prepareFolder`,
      `confirmIfDirty`, `discardAndClose`, `saveAllThenCommit`, `commit`) so the
      flow reads as a sequence (FR-004). Behaviour unchanged.
- [X] T033 [US2] In `src/renderer/hooks/useDocumentSession.ts`, decompose
      `handleQuitRequest` into named sub-steps (`flush`, `dirtyCheck`,
      `confirmQuit`, `discardAllQuit`, `saveAllLoop`) (FR-004).
- [X] T034 [US2] In `src/renderer/hooks/useWorkspaceTree.ts`, decompose
      `runDeleteConfirmation` into named sub-steps (`describe`, `plan`,
      `blockIfDirty`, `confirmTrash`, `permanentFallback`, `cleanup`) (FR-004).
- [X] T035 [US2] Add unit tests in `tests/renderer/domain/quit.test.ts` for any
      pure decision the sub-steps use (e.g. `shouldRePromptForFailedSave`
      branch matrix), extending T011. No decision rule is changed.

**Checkpoint**: the three flows are decomposed; `npm run test` (including the
new unit coverage) passes.

---

## Phase 5: US3 — User-visible behaviour is preserved (P1)

**Goal**: prove behavioural equivalence across the whole suite (FR-007/FR-008,
SC-003).

**Independent Test**: the full pre-existing suite passes after the refactor.

- [X] T036 [US3] Run `npm run lint`, `npm run typecheck`, `npm run test`, and
      `npm run test:e2e`. Every pre-existing test passes unchanged (only test
      *layout* may be re-homed, which has not happened yet in this phase — the
      splits land in Phase 6). If any test fails, the preceding extraction is
      behaviourally wrong: fix the module, not the test. Record the exact suite
      counts here.
      — Gate recorded 2026-08-06 after Phases 2–4: lint clean, typecheck clean,
      unit 351/351, e2e 120/121 — the single failure is the pre-existing
      `source.spec.ts` US5 flake (passes in isolation), identical to baseline.
**Checkpoint**: US3 gate green — the refactor is behaviourally invisible.

---

## Phase 6: US4 — Automated tests mirror production structure (P2)

**Goal**: oversized suites split by concern, shared helpers centralised, no
unit-level assertions duplicated in e2e (FR-009/FR-010).

**Independent Test**: for each named production module, its test file exists at
the mirrored path and uses shared helpers (US4 scenarios 1–3).

- [ ] T037 [US4] Create `tests/renderer/helpers.ts`: `createSession()`,
      `openTwoFiles()`, fixture factories — centralising the setup duplicated in
      documents.test.ts (US4 scenario 3).
- [ ] T038 [US4] Split `tests/renderer/documents.test.ts` (747 lines) by concern
      into `documents.open-save-close.test.ts` (OPEN_NEW/OPEN_EXISTING/
      SAVE_SUCCESS/SAVE_FAILED/CLOSE/ACTIVATE, current lines 15–325),
      `documents.dirty.test.ts` (UPDATE_CONTENT/CAPTURE_BASELINE/hasDirtyDocuments,
      lines 89–366), `documents.view.test.ts` (view mode + editorMatchesContent,
      lines 511–670), `documents.reroute.test.ts` (tab lifecycle + REROUTE_PATHS,
      lines 368–508 + 672–745). All use `helpers.ts`. Every covered rule remains
      covered (never delete coverage). Delete the original file.
- [X] T039 [P] [US4] Add `tests/renderer/treeMove.test.ts` and
      `tests/renderer/treeRename.test.ts` for the T022 extractions.
- [X] T040 [US4] Expand `tests/e2e/launch.ts` into the shared e2e harness:
      `launchApp({ configDir })` (merging the chrome/settings local copies),
      `stubOpenDialog(folder)`, `stubTrash()`, `closeAppSafely(app)`,
      `openFolder(window)`, `openFile(window, name)`, `typeInEditor(window,
      text)`, `pressShortcut(window, combo)` (from chrome.spec.ts).
- [X] T041 [US4] Update every e2e spec to use the shared harness: replace the
      repeated launch block, afterEach teardown, `openFolder`/`openFile`/
      `typeInEditor` local copies, and the deterministic-trash stubs with the
      launch.ts helpers. No spec loses a scenario.
- [X] T042 [P] [US4] Split `tests/e2e/recent.spec.ts` (774 lines) into
      `recent.open.spec.ts` (US1: reopen/dedupe/persistence of file+folder
      entries), `recent.deleted.spec.ts` (US3: unavailable entries, folder-open
      confirmation, OUTSIDE_WORKSPACE), `recent.persistence.spec.ts` (US4/FR-011/
      FR-012 caps, Clear, footer-note, ellipsis). Add `describe` blocks matching
      the existing banner comments in the other large specs (organize, source,
      tabs, native) so reporters can target US groups.
- [X] T043 [US4] Relocate low-level assertions duplicated in e2e to unit suites:
      the IPC error-code probes from recent.spec.ts (lines 549–563, 399–403) to
      `tests/main` unit tests, and the ellipsis assertion (already covered by
      `tests/renderer/shortenPath.test.ts`) — remove the e2e duplicates
      (FR-010). Keep e2e tests that prove native-dialog wiring, external events,
      and quit-with-dirty flows.

**Checkpoint**: `npm run test` and `npm run test:e2e` pass with the restructured
suites; no scenario deleted; e2e files under the size bound.

---

## Phase 7: US5 + US8 — Guardrails catch regressions; no cycles or dead code (P2)

**Goal**: the automated check passes on the refactored codebase and would flag a
regression (FR-012/FR-017/FR-018, SC-006/SC-009/SC-010).

**Independent Test**: `npm run check` reports zero violations; the synthetic
fixture test proves each rule fires.

- [ ] T045 [US5] Run `npm run check` on the refactored codebase. Fix any size or
      complexity violations it reports (a module/function over a limit that is
      genuinely cohesive may exceed it ONLY with a recorded justification in
      plan.md's decision log — US5 scenario 4). Verify `App.tsx` ≤ 300 and every
      source module ≤ 500 lines (SC-001/SC-002).
- [ ] T046 [US8] Fix any circular-import cycles `npm run check` reports
      (pre-existing cycles are resolved as part of the refactor — FR-018 edge
      case). Verify zero cycles (SC-009).
- [ ] T047 [US8] Fix any unused imports/types/exports reported (FR-017) — e.g.
      the `getWorkspaceState`/`getWorkspaceRoot` handlers.ts exports that are
      unused outside handlers.ts are dropped from `context.ts`'s public surface.
      Verify zero unused (SC-010). Confirm `npm run check` is fully green.
- [ ] T048 [US5] Confirm `tests/main/check-maintainability.test.ts` passes and
      `npm run check` exits 0 on the real tree (SC-006).

**Checkpoint**: `npm run check` green; no cycles; no unused exports; the
maintainability limits hold on the refactored module set.

---

## Phase 8: US7 — Stylesheets are organized by area (P3)

**Goal**: styles found per area; no stylesheet exceeds 400 lines (FR-016,
SC-008).

**Independent Test**: US7 acceptance scenarios; `npm run check` stylesheet rule
green.

- [ ] T049 [US7] Split `src/renderer/App.css` (732 lines) by area along its
      contiguous blocks: `chrome/chrome.css` (header/chrome/hamburger, lines
      72–240), `tabs/tabs.css` (297–419), `editor/editor.css` (421–536),
      `status/status.css` (547–618), `chrome/settings.css` (620–732). `App.css`
      keeps the reset/tokens/shell/panels (1–70, 242–295) and the editor-font
      override block (21–47). Each owning component imports its own stylesheet;
      selectors are untouched (mechanical move).
- [ ] T050 [US7] Verify no stylesheet exceeds 400 lines and `npm run check`
      reports no `size-css` violations (SC-008). Grep the e2e specs for any
      selector that moved (none should — selectors are unchanged).

**Checkpoint**: styles split by area; `npm run test:e2e` still green (visual
styling unchanged).

---

## Phase 9: US6 — Documentation keeps pace (P3)

**Goal**: the policy index resolves; references to moved modules are updated in
the same change (FR-013/FR-014).

**Independent Test**: read `docs/domain-policies.md`; each referenced location
exists (US6 scenario 1); no stale path references remain (US6 scenario 2).

- [ ] T051 [US6] Verify `docs/domain-policies.md` (T009) references resolve to
      real code in the refactored tree; correct any location that changed during
      implementation. Ensure each invariant is identified by the same name it had
      before the refactor (US6 scenario 3).
- [ ] T052 [US6] Grep `src/`, `tests/`, `docs/`, `AGENTS.md` for stale
      references to pre-refactor locations (`handlers.ts`, `App.tsx`-as-god
      comments, `src/renderer/App` orchestrator wording, `ipc/handlers` paths)
      and update them (e.g. the HamburgerMenu.tsx comment pointing at
      `handleMenuCommand in App.tsx` → `useMenuCommands`). The two spec asset
      documents are inputs and are not rewritten (FR-014 applies to
      documentation of the codebase, not to the suggestions themselves).

**Checkpoint**: every policy reference resolves; no stale path in docs/code
comments.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: final gate, quickstart, and spec archive.

- [ ] T053 Run the complete gate: `npm run lint`, `npm run typecheck`,
      `npm run test`, `npm run test:e2e`, `npm run check` — all green. Run
      quickstart.md §1–§5 and note any platform discrepancy. Verify
      plan/research/data-model/contracts are consistent with the final code
      (US3 scenario 5, SC-003/SC-006/SC-009/SC-010/SC-011).
- [ ] T054 Archive the spec as part of this PR (AGENTS.md workflow): `git mv`
      `specs/017-codebase-refactor` → `specs/archive/017-codebase-refactor`, set
      the spec's `**Status**` to `Archived`, and update the Current
      implementation status table in `AGENTS.md` (row 017 → Archived).

**Checkpoint**: full gate green; spec archived; AGENTS.md updated.

---

## Dependencies & Execution Order

| Phase | Depends on | Blocks |
|-------|------------|--------|
| Phase 1: Setup | — | Phase 2 |
| Phase 2: Foundational | Phase 1 | Phases 3–10 (pure units + guardrail first) |
| Phase 3: US1 split | Phase 2 (T002/T003/T004) | Phase 4 (sub-step decomposition edits the new hooks) |
| Phase 4: US2 | Phase 3 | Phase 5 (equivalence gate after all structural change) |
| Phase 5: US3 gate | Phase 4 | Phase 6 |
| Phase 6: US4 tests | Phase 5 | Phase 7 |
| Phase 7: US5+US8 guardrails | Phase 6 | Phase 8 |
| Phase 8: US7 CSS | Phase 7 | Phase 9 |
| Phase 9: US6 docs | Phase 8 | Phase 10 |
| Phase 10: Polish + archive | Phases 2–9 | — |

### Parallel Opportunities

- Phase 2: T004/T005/T006/T007/T009 are disjoint files and can run in parallel;
  T010/T011 depend on T002/T003; T008 is independent.
- Phase 3 main: T024–T029 are disjoint handler modules (each imports only
  `context.ts`, T023) — they can run in parallel after T023.
- Phase 3 renderer: the hooks share an API surface and App.tsx rewiring — run
  sequentially in dependency order (T012 → … → T021).
- Phase 6: T039 and T042 are disjoint; T041 must precede T043 (specs must use
  the harness before assertions are relocated).

### High-level guarantee

No new IPC operations, no preload change, no path/validation change, no
save/dirty/prompt-semantics change (Principles I, II, III). Every module over a
maintainability limit after the refactor has a recorded justification or the
refactor is incomplete. The preload contract tests stay green (SC-011).

---

## Notes

- [P] tasks touch disjoint files.
- Handler bodies are moved verbatim. A behavioural test failure after a move
  means the move is wrong — never weaken the test.
- `npm run test:e2e` builds the app first (Playwright); on Windows it launches
  Electron headless (see `tests/e2e/launch.ts`).
- `npm run check` is the new maintainability gate (reporting). The four-command
  gate plus `npm run check` must be green before T054.
- MVP = end of Phase 3 (both splits behaviourally equivalent); Phases 4–10 add
  decomposition, the equivalence gate, test restructure, guardrail enforcement,
  CSS split, docs, and archive.
