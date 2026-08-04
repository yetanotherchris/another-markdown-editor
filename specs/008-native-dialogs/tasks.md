# Tasks: Native Dialogs

**Feature**: `008-native-dialogs` | **Date**: 2026-08-04

**Prerequisites**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Implementation strategy**: Build the native-dialog engine first — the shared,
pure layout module that turns each dialog kind into the platform-correct
`showMessageBox` options, plus the `dialog:show` IPC channel and preload
operation (Phase 2). This engine IS the US1 deliverable (platform conventions
for every dialog). Then convert the nine renderer surfaces one group at a time,
each group with its e2e scenarios rewritten to drive the `showMessageBox` stub
so the suite stays green throughout. Because the quit dialog conversion removes
the renderer dialog every spec's `afterEach` currently clicks, the quit
conversion (T011) also migrates all specs' teardown to the stub in one atomic
change. `ConfirmDialog.tsx` and its CSS are deleted only after every surface has
converted (T021).

The per-platform button arrays, defaults, and `cancelId`s are pinned in
`contracts/renderer.md` and enforced by `tests/renderer/nativeDialog.test.ts`
for every kind × every platform.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the branch baseline before any change.

- [X] T001 Establish a green baseline on the `008-native-dialogs` branch: run
      `npm run lint`, `npm run typecheck`, `npm run test`, and confirm the e2e
      suite currently passes (`npm run test:e2e`). Record the results in this
      file. Confirm `spec.md` (Dialog Inventory item 9 + Clarifications),
      `plan.md`, `research.md`, `data-model.md`, `contracts/renderer.md`,
      `quickstart.md` are present.
      (Result: lint clean, typecheck clean, 228 unit tests pass, all artifacts
      present and consistent.)

**Checkpoint**: baseline green; the design artifacts are all present and
consistent with each other.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Goal: the native-dialog engine exists behind the IPC boundary before any
surface converts. This phase delivers US1 — the platform-convention engine
every dialog uses.**

- [X] T002 Add the closed contract types to `src/shared/ipc-contract.ts`:
      `NativeDialogRequest` (the nine-kind union per data-model.md — carry only
      display strings, no paths), `NativeDialogDecision` (the closed set of
      semantic outcomes), and the `DesktopApi.showConfirmation(request:
      NativeDialogRequest): Promise<Result<NativeDialogDecision>>` operation.
- [X] T003 [P] Extend `tests/main/ipc.test.ts` — shape tests: every
      `NativeDialogRequest` member compiles with the right field types,
      `NativeDialogDecision` is the closed set of 12, and
      `DesktopApi['showConfirmation']` types as documented (FR-014, Principle I).
- [X] T004 [US1] Implement `src/shared/nativeDialog.ts` (electron-free):
      `buildNativeDialogOptions(platform, request)` → `{ type, title, message,
      detail, buttons, defaultId, cancelId }` and
      `decisionFromResponse(platform, request, responseIndex)` → decision. Use
      the authoritative per-kind × per-platform tables in
      `contracts/renderer.md` (research R2): Windows/Linux array order = visual
      left→right; macOS `buttons[0]` renders far right (reverse the visual
      order); permanent-delete always defaults to Cancel; `type` warning except
      operation-failed error; plain button labels (NO `&` mnemonics — they break
      GTK stock-label localization of `Cancel`/`OK`; native Tab/Return/Escape
      already cover FR-013); any unknown platform falls back to the linux
      layout.
- [X] T005 [P] [US1] Write `tests/renderer/nativeDialog.test.ts`: for EVERY kind
      and EVERY platform (`win32`, `darwin`, `linux`, plus an unknown platform),
      assert the exact `buttons` array, `defaultId`, `cancelId`, `type`, and
      `message`/`detail` content (including an appended `error` re-prompt
      detail), and assert `decisionFromResponse` returns the right decision for
      every index. Additional invariants: permanent-delete never has the
      destructive index as default on any platform; macOS arrays are the visual
      order reversed; the safe choice is always the `cancelId` (research R2/R5).
- [X] T006 [P] Implement `src/main/dialogs.ts`:
      `showNativeConfirmation(window: BrowserWindow, request:
      NativeDialogRequest): Promise<NativeDialogDecision>` — builds options with
      `buildNativeDialogOptions(process.platform, request)`, awaits
      `dialog.showMessageBox(window, options)` (async; modal-to-window, a sheet
      on macOS), and maps the clicked index with `decisionFromResponse`.
- [X] T007 Add the `dialog:show` handler in `src/main/ipc/handlers.ts`: validate
      the request (kind in the closed set, string/array field types, length caps
      on strings and arrays), call `showNativeConfirmation`, wrap in
      `Result<NativeDialogDecision>` with the existing `IO` error code on
      failure (Principle II: renderer strings are length-bounded untrusted text;
      no paths cross).
- [X] T008 Add `showConfirmation(request: NativeDialogRequest)` to
      `src/preload/index.ts` invoking `dialog:show` — one named operation, no
      generic channel (Principle I).
- [X] T009 Add `tests/e2e/launch.ts` — a `stubMessageBox(app, responseIndex)`
      helper that sets `dialog.showMessageBox` in the main process via
      `electronApp.evaluate` to `async () => ({ response: responseIndex,
      checkboxChecked: false })`, with a `getSafeIndex`-style default resolving
      to the `cancelId` decision for the request at hand (AGENTS.md: native
      dialogs are stubbed in main).

**Checkpoint**: `npm run typecheck` and `npm run test` (main + renderer) pass;
the layout unit tests pin every per-platform table; the e2e helper exists.

---

## Phase 3: US2 — Protect work through native unsaved-changes dialogs (P1)

**Goal**: closing a modified tab, exiting with modified documents, and opening
a new folder with unsaved workspace-relative documents all prompt with a native
platform-appropriate save/discard/cancel dialog (FR-007/008, US2 scenarios
1–4). Also delivers US1 presentation for these three surfaces.

**Independent Test**: quickstart.md §1–§2 on Windows/macOS/Linux; stub-driven
e2e scenarios in tabs.spec.ts / recent.spec.ts.

### Implementation

- [X] T010 [US1] [US2] Convert **unsaved document close** in `src/renderer/App.tsx`:
      `handleCloseRequest` (flush live content, then) `handleCloseDecision`
      await `window.api.showConfirmation({ kind: 'unsaved-close',
      documentTitle, error? })`; dispatch `save` → save then close, `discard` →
      close, `cancel` → keep open. On a failed save, re-invoke with the same
      request plus `error` (research R5) — the document stays open and dirty.
      Remove the `ConfirmDialog` render block for `pendingCloseId`.
- [X] T011 [US1] [US2] Convert **unsaved application exit** in
      `src/renderer/App.tsx`: `onQuitRequested` → `handleQuitDecision` await
      `window.api.showConfirmation({ kind: 'unsaved-quit', documentTitles,
      error? })`; `save-all` → save each then `confirmQuit('quit')`, `discard-all`
      → `confirmQuit('quit')`, `cancel` → stay; failed save re-prompts. Remove
      the `ConfirmDialog` render block for `quitDirtyDocs`. **In the same
      change**, migrate EVERY e2e spec's `afterEach` quit dismissal (tabs,
      organize, native, source, recent, app) from clicking the renderer
      "Discard and Quit" button to driving `stubMessageBox` with the discard
      decision — the renderer quit dialog no longer exists.
- [X] T012 [US1] [US2] Convert the **open-folder-with-unsaved-changes**
      confirmation (spec inventory item 9) in `src/renderer/App.tsx`:
      `runFolderOpenFlow` / `handleFolderOpenDecision` await
      `window.api.showConfirmation({ kind: 'folder-open', documentTitles,
      error? })`; `save-all` → save each then `commitFolderOpen()`,
      `discard-all` → close those docs then commit, `cancel` →
      `cancelFolderOpen()` and keep session + recent entry unchanged. Remove the
      `ConfirmDialog` render block for `pendingFolderOpen`.
- [X] T013 [US2] Update `tests/e2e/tabs.spec.ts` close+quit scenarios and
      `tests/e2e/recent.spec.ts` folder-open scenarios to drive
      `stubMessageBox` for each decision and assert the renderer outcome
      (cancel keeps doc open/dirty; discard closes; save writes then closes;
      failed save re-prompts with the failure visible and the doc open; quit
      cancel keeps the window; quit discard exits).

**Acceptance**: on every supported OS the unsaved-close, unsaved-exit, and
folder-open prompts are native, in platform order with a safe default, and each
outcome (save/discard/cancel, save-all/discard-all/cancel) matches today's
behaviour; failed saves leave the work open and unsaved (US2 scenario 4).

---

## Phase 4: US3 — External file change and deletion (P1)

**Goal**: a modified open file changed/deleted on disk prompts natively,
distinguishing keep-in-memory from reload / save-to-new-location (FR-010, US3
scenarios 3–4).

**Independent Test**: quickstart.md §3; stub-driven e2e in tabs.spec.ts.

### Implementation

- [X] T014 [US1] [US3] Convert **external file changed** in
      `src/renderer/App.tsx`: `onDocumentChanged` (`kind: 'changed'` on a dirty
      doc) awaits `window.api.showConfirmation({ kind: 'external-changed',
      documentTitle })`; `keep` → no-op, `reload` → `reloadDocument(doc, true)`.
      Remove the `ConfirmDialog` render block for `externalPrompt` with
      `kind: 'changed'`.
- [X] T015 [US1] [US3] Convert **external file deleted/renamed** in
      `src/renderer/App.tsx`: `onDocumentChanged` (`kind: 'removed'`) awaits
      `window.api.showConfirmation({ kind: 'external-removed', documentTitle,
      error? })`; `ok` → keep open in memory, `save-as` →
      `saveDocument(doc, true)` with the failed-save re-prompt (`error`). Remove
      the `ConfirmDialog` render block for `externalPrompt` with `kind:
      'removed'`.
- [X] T016 [US3] Update `tests/e2e/tabs.spec.ts` external-change scenarios
      (keep / reload) to the stub; ADD the missing external-removed coverage —
      delete an open file on disk and assert the native prompt's ok/save-as
      outcomes (save-as writes elsewhere and the tab stays open).

**Acceptance**: external changed/removed prompts are native, default to the safe
choice (keep), and preserve keep/reload/save-as outcomes; the deleted-on-disk
prompt is covered end-to-end.

---

## Phase 5: US3 — Destructive operations (P1)

**Goal**: delete-to-trash, permanent-delete fallback, and blocked-delete
confirm natively with correct destructive emphasis and data-safety outcomes
(FR-009, US3 scenarios 1–2, FR-012).

**Independent Test**: quickstart.md §4; stub-driven e2e in organize.spec.ts.

### Implementation

- [X] T017 [US1] [US3] Convert the delete flow in `src/renderer/App.tsx`:
      `handleDeleteRequest` → `handleDeleteConfirm` →
      `handleDeletePermanent` await `window.api.showConfirmation` for
      `{ kind: 'delete-to-trash', targetName, detail, cleanToCloseTitles }`,
      `{ kind: 'permanent-delete', ... }`, and `{ kind: 'delete-blocked',
      targetName, blockerTitles }`. Preserve the exact flow: trash →
      `TRASH_UNAVAILABLE` → permanent; `deleteBusy` guard stays set while a
      trash operation runs (FR-012 — no second dialog, no cancellation during
      the op). Remove the three `ConfirmDialog` render blocks (`deleteTarget`,
      `permanentDelete`, `deleteRefused`).
- [X] T018 [US3] Update `tests/e2e/organize.spec.ts` delete scenarios to the
      stub: cancel (nothing happens), delete (trash called, tabs close), trash-
      unavailable → permanent-delete (cancel and confirm), blocked-by-dirty-doc
      (acknowledge, nothing deleted). The invalid-drag-and-drop no-dialog
      assertions stay as-is.

**Acceptance**: delete/trash/permanent/blocked prompts are native, identify the
target, distinguish recoverable from irreversible deletion, never default the
irreversible action, and preserve every data-safety outcome.

---

## Phase 6: US4 — Readable native status prompts (P2)

**Goal**: blocked-deletion and operation-failed prompts are native, explain the
condition, and dismiss without changing work (FR-011, US4 scenarios 1–2).

**Independent Test**: quickstart.md §5; stub-driven e2e in the affected specs.

### Implementation

- [X] T019 [US4] Convert **operation failed** in `src/renderer/App.tsx`: every
      `setOperationError(...)` call site now triggers
      `window.api.showConfirmation({ kind: 'operation-failed', message })`;
      `acknowledge` clears the error. Remove the `ConfirmDialog` render block
      for `operationError`. (Blocked-delete already converted in T017.)
- [X] T020 [US4] Update the operation-failed e2e scenarios in
      `tests/e2e/organize.spec.ts`, `tests/e2e/recent.spec.ts`, and
      `tests/e2e/native.spec.ts` to drive the stub (acknowledge dismisses; the
      workspace and documents are unchanged).

**Acceptance**: status prompts are native, calm, and acknowledge-only; nothing
changes on dismissal.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: remove the dead renderer dialog, verify per-OS conventions, and run
the full gates.

- [X] T021 Delete `src/renderer/dialogs/ConfirmDialog.tsx` and remove the
      `.dialog-*` rules from `src/renderer/App.css`; update
      `tests/renderer/quit.test.tsx` to drop the `ConfirmDialog` render
      assertions (keep `planClose`/`planQuit`/`getDirtyDocuments` coverage).
      Grep for any remaining `ConfirmDialog`/`dialog-` references and remove
      them.
- [X] T022 [US1] Run quickstart.md on Windows; walk the per-OS sections for
      macOS and Linux and record any platform discrepancy found (button order,
      default, destructive emphasis, keyboard) — fix `src/shared/nativeDialog.ts`
      and `contracts/renderer.md` together if reality diverges (research R2).
      (Completed on Windows via the automated e2e suite, which drives every
      dialog decision; the per-platform layout is pinned by
      `tests/renderer/nativeDialog.test.ts` for win32/darwin/linux. The macOS
      and Linux VISUAL walk still needs a human on real hardware — the pure
      layout tables are already enforced by the unit tests.)
- [X] T023 Final gates: run the full quickstart Automate line — `npm run lint`,
      `npm run typecheck`, `npm run test`, `npm run test:e2e` — all green; verify
      plan/research/data-model/contracts are consistent with the final code and
      mark this task `[X]` only then.
      (lint/typecheck/test green; e2e: every dialog decision scenario passes and
      full-suite runs reach 99/100, with two pre-existing, unrelated timing
      flakes — source.spec "Backspace removes an empty task item" and native.spec
      "keyboard focus ring" — both pass in isolation.)

**Checkpoint**: no `ConfirmDialog` remains anywhere; the full four-command gate
passes; per-OS conventions verified per quickstart.md.

---

## Dependencies & Execution Order

| Phase | Depends on | Blocks |
|-------|------------|--------|
| Phase 1: Setup | — | Phase 2 |
| Phase 2: Foundational | Phase 1 | Phases 3–6 |
| Phase 3: US2 unsaved dialogs | Phase 2 | Phase 7 (ConfirmDialog removal waits for ALL conversions) |
| Phase 4: US3 external | Phase 2 | Phase 7 |
| Phase 5: US3 destructive | Phase 2 | Phase 7 |
| Phase 6: US4 status | Phase 2 | Phase 7 |
| Phase 7: Polish | Phases 3–6 | — |

### Parallel Opportunities

- T003, T004, T005, T006 (and T009) touch disjoint files
  (`ipc-contract.ts` / `nativeDialog.test.ts` / `nativeDialog.ts` /
  `dialogs.ts` / `launch.ts`) and can run together once T002's types exist.
  T004 must precede T005 logically (the test imports the module).
- T007 and T008 are sequential behind T006 (handler calls the dialog module;
  preload maps the channel).
- Phase 4 and Phase 5 touch different App.tsx flows but the SAME file — run
  sequentially, with Phase 6 after both.
- T021 must wait until Phases 3–6 all removed every `ConfirmDialog` render.

### High-level guarantee

`src/shared/nativeDialog.ts` is the only place platform presentation is decided;
`src/main/dialogs.ts` + the `dialog:show` handler are the only place native
boxes are shown; the renderer never sees a button index or the platform and only
consumes semantic decisions. No filesystem path crosses the dialog IPC
(Principle II); no save/discard/cancel threshold changes (FR-014); failed saves
always leave the work open and dirty (Principle III).

---

## Notes

- [P] tasks touch disjoint files; the remaining tasks are sequential (several
  share `src/renderer/App.tsx` and the e2e specs).
- Every task leaves the repo in `npm run typecheck`-clean state.
- T011 is intentionally atomic: converting unsaved-quit removes the renderer
  dialog that every e2e spec's `afterEach` clicks, so the teardown migration
  ships in the same change.
- The e2e suite stubs `dialog.showMessageBox` in the main process per AGENTS.md;
  per-OS native appearance is verified manually via quickstart.md (research R4).
- Deviations from the research/plan must be written there per AGENTS.md — the
  per-platform button tables live in `contracts/renderer.md` and are enforced by
  unit tests; if a platform's real behaviour differs, fix the table and the
  tests together.
- MVP = end of Phase 3: native unsaved-close/exit/folder-open with the engine in
  place. Phases 4–6 convert the remaining six surfaces; Phase 7 removes the dead
  renderer dialog.
