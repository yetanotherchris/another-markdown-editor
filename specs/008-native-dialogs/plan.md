# Implementation Plan: Native Dialogs

**Branch**: `008-native-dialogs` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-native-dialogs/spec.md`

## Summary

Replace every confirmation and status dialog surface in the app with the
operating system's native message box (`dialog.showMessageBox` in the main
process), so each prompt follows the active platform's visual language, button
ordering, default-action treatment, destructive-action emphasis, focus and
keyboard conventions (FR-001…FR-013). The Dialog Inventory has nine surfaces
(eight in the spec plus the folder-open unsaved-changes confirmation, added by
a Clarification on 2026-08-04): unsaved document close, unsaved application
exit, external file changed, external file deleted/renamed, delete to trash,
permanent-delete fallback, delete blocked by unsaved changes, operation failed,
and open-folder-with-unsaved-changes.

All decision logic stays where it is today — the renderer owns the document,
dirty-state and delete-plan state and continues to drive save/discard/reload/
delete flows. Only the *presentation* moves to the main process, behind one new
named IPC operation (`showConfirmation`) whose request is an exhaustive,
per-dialog-kind discriminated union and whose response is a semantic decision
(`save`, `discard`, `cancel`, `keep`, `reload`, `save-as`, `delete`, `acknowledge`, …).
Main builds the platform-correct `showMessageBox` options from a shared, pure,
unit-testable layout module and maps the clicked button index back to the
semantic decision; the renderer never sees button indices or platform logic.

No native message box exists in the app today (verified 2026-08-04: only the
three file/folder pickers use `dialog`). This feature adds the first
`showMessageBox` calls. Behaviour-preservation guarantees from FR-014 and the
spec's Assumptions hold: save/discard/cancel outcomes, failed-save behaviour,
path validation and confirmation thresholds are unchanged — only presentation
and platform interaction conventions change.

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: No new runtime dependencies. Existing: Electron 43
(`dialog.showMessageBox`, async). The layout and decision-mapping logic is a new
electron-free shared module (`src/shared/nativeDialog.ts`) so it runs under
Vitest in the node project without mocking Electron.

**Storage**: N/A — no persistence. Dialog state already lives in renderer
component state; it stays there.

**Testing**: Vitest 4 (node project for `tests/main`, jsdom for
`tests/renderer`). The per-platform layout/mapping pure functions are tested in
`tests/renderer/nativeDialog.test.ts` for all three platforms and all nine
kinds. Playwright e2e (`npm run test:e2e`) stubs `dialog.showMessageBox` in the
main process via `electronApp.evaluate` (per AGENTS.md) so each decision can be
exercised headlessly; native appearance is verified manually per OS via
quickstart.md.

**Target Platform**: Windows, macOS, Linux desktop. Linux presentation follows
the active desktop environment via GTK (spec Assumptions).

**Project Type**: Desktop application (Electron), three build targets.

**Performance Goals**: Native dialogs are modal and asynchronous; nothing is
added to the keystroke path (Principle IV). The dialog IPC is a single
await per user action.

**Constraints**: Renderer sandboxed; `dialog.showMessageBox` is main-only
(Principle I). The preload API stays a fixed list of named operations — the
single `showConfirmation(request)` takes the closed `NativeDialogRequest` union,
never a free-form channel. The request carries only display strings and
renderer-owned titles (document titles, file names, plan summaries); no paths
cross the boundary for these dialogs, so no new path surface exists. Renderer
supplied content is treated as untrusted text: main bounds its length before
passing it to the native dialog (Principle II).

**Scale/Scope**: Nine dialog kinds, one IPC channel, one shared layout module,
one main-process dialog module. Standard OS file/folder pickers are out of scope
(spec Assumptions: already native).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | Native dialogs are shown from the main process (`dialog.showMessageBox`). The renderer gains one named operation (`showConfirmation`) over a closed request union; the preload exposes no generic `invoke` and no dialog handle | **PASS** |
| II. Every Path Is Untrusted | Dialog requests carry display strings only (titles, file names, plan summaries) — no filesystem paths cross the boundary. Renderer strings are length-bounded and passed as untrusted text to `showMessageBox`; no path is resolved, so no escape surface is added | **PASS** |
| III. Never Lose The User's Words | All save/discard/cancel and delete outcomes are preserved verbatim from the current renderer flows; a failed save re-prompts with the failure explained and the document stays open and dirty (US2 scenario 4, FR-007/008/014). Native presentation never weakens a confirmation threshold | **PASS** |
| IV. Calm, Predictable Editing | Dialogs are user-action-driven and modal; no dialog work happens on the keystroke path. One dialog is shown at a time (modal-to-window), matching the spec's single-decision-surface edge case | **PASS** |
| V. Test What Can Corrupt Or Escape | `tests/renderer/nativeDialog.test.ts` asserts the exact per-platform button array, default, cancel and decision mapping for every kind (FR-001/003/005/006); e2e re-stubs `showMessageBox` to drive every decision path and asserts the renderer outcomes incl. failed-save re-prompt | **PASS** |

## Phase 1 Design decisions

**Shared layout module (`src/shared/nativeDialog.ts`)** — pure, electron-free,
the single source of truth for platform presentation (research R1–R4):

- `NativeDialogRequest` — the closed discriminated union of the nine kinds with
  the exact display strings each needs (document title(s), target name, delete
  plan summary, blocker titles, error message, optional `error` detail for
  re-prompts). Lives in `src/shared/ipc-contract.ts` alongside the other
  contract types.
- `NativeDialogDecision` — the semantic outcome the renderer acts on:
  `'save' | 'discard' | 'save-all' | 'discard-all' | 'keep' | 'reload' |
   'ok' | 'save-as' | 'delete' | 'delete-permanent' | 'acknowledge' | 'cancel'`.
- `buildNativeDialogOptions(platform, request)` → `{ type, title, message,
  detail, buttons, defaultId, cancelId }`. `noLink`/`normalizeAccessKeys` are
  not passed (see Message-box options).
  `message` is the bold question line, `detail` the supplementary text
  (affected-document list, delete-plan warnings, re-prompt error). On macOS the
  `title` is ignored by the OS so all meaning lives in `message`/`detail`
  (research R3).
- `decisionFromResponse(platform, request, responseIndex)` → the decision for
  the index the OS returned. Main maps the response to a decision so the
  renderer never needs the platform.
- Unknown `platform` falls back to the Linux (GTK) layout, the closest
  conventional equivalent (spec edge case: Linux fallback preserves ordering and
  accessibility conventions).

**Per-platform button contract** (the authoritative table is in
`contracts/renderer.md`; research R1–R4 record the evidence):

- **Windows** (Electron uses `TaskDialogIndirect`): the buttons array is the
  visual left→right order. Labels that match common buttons (`OK`, `Cancel`,
  `Yes`, `No`) render as standard buttons; any other label renders as a modern
  command link (`noLink` left unset → the native modern-Windows look). Enter
  activates `defaultId`, Escape and the window's X return `cancelId`.
  Convention: the commit/primary action first (leftmost), Cancel last; the
  default is the expected action.
- **macOS** (Electron uses `NSAlert`): Apple documents that buttons are placed
  "starting near the right side … going toward the left", and Electron confirms
  the first array element is the default until overridden. So the array order is
  the *reverse* of the visual order: `buttons[0]` renders at the far right
  (default position), later buttons extend left. Convention: default on the
  right, Escape = `cancelId` (`Cancel` middle in the classic
  [Don't Save] [Cancel] [Save] layout).
- **Linux** (Electron uses `GtkMessageDialog`): the buttons array is the visual
  left→right order, `defaultId` is the default response, and Escape/window close
  return `cancelId`. Stock labels `Cancel`/`OK`/`Yes`/`No` are localized by GTK.
  Convention: Cancel left, primary right.
- **Default-action rule (FR-006, US1 scenario 4)**: the default is the
  platform-appropriate safe *or expected* choice. Recoverable destructive
  actions (delete to trash) may be the default where the platform expects them
  (Windows/macOS/Linux all place the delete/commit action as default). An
  irreversible action (permanent delete) is never the default on any platform —
  `defaultId` and `cancelId` both point at Cancel.

**Message-box options** — `type` is `'warning'` for the confirmation surfaces
(unsaved-close/quit, external-change, delete, blocked-delete, folder-open) and
`'error'` for operation-failed. `noLink: true` is set on Windows so every label
renders as a standard push button (VS Code-style `[Save] [Don't Save] [Cancel]`)
rather than the command-link style Electron defaults to for non-common labels.
`title` is left empty so the OS shows the application name in the window title
(the native convention; macOS ignores the title). No `&` mnemonics /
`normalizeAccessKeys` are used (decision log 2026-08-04): `&` breaks GTK's
stock-label localization of `Cancel`/`OK`, and native boxes already give
Tab/Return/Escape keyboard access (FR-013).

**Main-process module (`src/main/dialogs.ts`)** — `showNativeConfirmation(
window, request)` awaits `dialog.showMessageBox(window, options)` (async; a
native box is modal to the window, and on macOS appears as a sheet), then
returns `decisionFromResponse(...)`. Called from a new `dialog:show` handler in
`src/main/ipc/handlers.ts` that first validates the request (kind in the closed
set, string/array field types, length caps) and wraps the result in
`Result<NativeDialogDecision>`.

**Renderer (`src/renderer/App.tsx`)** — the nine `ConfirmDialog` render blocks
and the component itself are removed; `ConfirmDialog.tsx` and its CSS are
deleted. Each pending-dialog state (`pendingCloseId`, `quitDirtyDocs`,
`externalPrompt`, `deleteTarget`, `permanentDelete`, `deleteRefused`,
`operationError`, `pendingFolderOpen`) is now consumed by the matching async
handler, which awaits `window.api.showConfirmation(request)` and dispatches on
the returned decision:

- The existing decision handlers (`handleCloseDecision`, `handleQuitDecision`,
  `handleExternalDecision`, `handleDeleteConfirm`, `handleDeletePermanent`,
  `handleFolderOpenDecision`) keep their exact save/discard/cancel semantics but
  receive the decision as the IPC return value instead of a React button click.
- A failed save during close/quit/folder-open re-invokes `showConfirmation`
  with the same request plus an `error` detail carrying the failure message —
  the document(s) stay open and unsaved (US2 scenario 4, research R5).
- FR-012 (no duplicate completion / no cancel while a destructive action runs):
  the native dialog is modal, so the user cannot double-submit or cancel once a
  button is clicked and the operation begins; the existing `deleteBusy` renderer
  guard continues to block a second delete dialog while a trash operation is in
  flight.
- The quit flow is unchanged in shape: main intercepts window close →
  `app:quitRequested` → renderer flushes live content → dirty docs prompt via
  `showConfirmation` → `confirmQuit('quit')`.

**Preload (`src/preload/index.ts`)** — `showConfirmation(request:
NativeDialogRequest): Promise<Result<NativeDialogDecision>>` invoking
`dialog:show`. One named operation; no generic channel (Principle I).

**E2E strategy** — `dialog.showMessageBox` is stubbed in the main process in
each spec via `electronApp.evaluate` (the AGENTS.md-mandated approach, already
used for `showOpenDialog`/`shell.trashItem`). A shared helper
(`tests/e2e/launch.ts` or a new `tests/e2e/helpers.ts`) returns a chosen
`{ response }` per test. Existing renderer-dialog assertions (`getByRole('dialog')`,
button clicks) are rewritten to drive the decision through the stub and assert
the renderer outcome (document closed/saved/kept, trash called, session intact).
Per-platform native appearance is NOT automatable and is verified manually via
quickstart.md (research R4).

## Project Structure

### Documentation (this feature)

```text
specs/008-native-dialogs/
├── spec.md              # Requirements (inventory extended by Clarification 2026-08-04)
├── plan.md              # This file
├── research.md          # R1…R5 platform/behaviour evidence
├── data-model.md        # NativeDialogRequest/Decision/Layout types + state transitions
├── quickstart.md        # Manual per-OS verification script
├── contracts/
│   └── renderer.md      # IPC + preload + per-platform button/label contract
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/shared/
├── ipc-contract.ts              # + NativeDialogRequest, NativeDialogDecision, DesktopApi.showConfirmation
└── nativeDialog.ts              # NEW: pure buildNativeDialogOptions / decisionFromResponse (electron-free)

src/main/
├── dialogs.ts                   # NEW: showNativeConfirmation(window, request) → showMessageBox + map
└── ipc/handlers.ts              # + 'dialog:show' handler: validate request, wrap Result

src/preload/index.ts             # + showConfirmation(request) named operation

src/renderer/
├── App.tsx                      # MODIFY: await showConfirmation per pending dialog; delete ConfirmDialog blocks
├── App.css                      # MODIFY: remove .dialog-* rules
└── dialogs/ConfirmDialog.tsx    # DELETED (no longer used)

tests/
├── renderer/nativeDialog.test.ts   # NEW: every kind × win32/darwin/linux: buttons, default, cancel, decision map
├── renderer/quit.test.tsx          # MODIFY: drop ConfirmDialog render tests; keep planClose/planQuit coverage
├── main/ipc.test.ts                # MODIFY: shape tests for the new request/decision types
└── e2e/                            # MODIFY: stub showMessageBox in all specs; rewrite dialog assertions
    ├── launch.ts (or helpers.ts)   # + stubMessageBox(app, responseIndex) helper
    ├── tabs.spec.ts                # close/quit/external-change decisions through the stub
    ├── organize.spec.ts            # delete/trash/permanent-delete/blocked decisions through the stub
    ├── recent.spec.ts              # folder-open confirmation through the stub
    ├── native.spec.ts              # + external-deleted dialog coverage (gap today)
    ├── source.spec.ts / app.spec.ts# quit/operation-failed paths through the stub
```

**Structure decision**: native presentation is a main-process concern
(`dialog.showMessageBox` is main-only, Principle I); the layout contract that
turns a dialog kind into platform options is shared and electron-free so it is
unit-testable without Electron. The renderer keeps every decision it already
owns and only swaps the render surface for a named IPC call — the narrowest
possible boundary change.

## Phase status

- Phase 1: Setup (green baseline; add the `dialog:show` contract types + layout module + unit tests)
- Phase 2: Main-process native dialog (dialogs.ts + handler + preload wiring)
- Phase 3: US1 (P1) + US2 (P1) — convert unsaved close, unsaved exit, and the folder-open confirmation to native
- Phase 4: US2 external dialogs — external file changed and deleted/renamed
- Phase 5: US3 (P1) — delete to trash, permanent-delete fallback, blocked-delete; FR-012 busy semantics
- Phase 6: US4 (P2) — operation-failed native dialog
- Phase 7: E2E rewrite (stub `showMessageBox` across all specs + new deleted-file coverage) + final gates

## Deferred / later features

- Replacing the folder-open confirmation is in scope (Clarification 2026-08-04);
  standard file/folder pickers remain native and unchanged (spec Assumptions).
- Custom icons on message boxes (platform assets + packaging complexity; the OS
  warning/error icons are the native default).
- A `checkboxLabel` "don't ask again" suppression on any dialog (not in the
  spec; would change confirmation thresholds — FR-014 forbids).

## Complexity tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| One IPC operation (`showConfirmation`) whose request is a nine-kind union, instead of nine named preload methods | The nine surfaces are the same shape (build options → show → map decision) and share one layout module; a single op with an exhaustive, type-checked union keeps the preload surface small while remaining a fixed named list (Principle I) | Nine hand-written preload methods + nine channels (identical plumbing nine times) or a generic `invoke(channel, …)` (forbidden) |
| Per-platform button arrays authored in a shared module that encodes macOS's reversed visual order | Electron's `NSAlert` renders `buttons[0]` at the far right while Windows/GTK render array order left→right; one literal array cannot be correct on both (FR-003, research R1) | Shipping one cross-platform order (violates FR-003 — imposes one OS's order on another) |
| Re-prompt (close + reopen) instead of an inline error inside the same dialog | Native message boxes are modal and resolve on click; the old `ConfirmDialog` could stay open with an inline `.dialog-error`. US2 scenario 4 requires the failure to be explained and the work to stay open — a re-shown dialog satisfies it without weakening the outcome | Rendering a custom overlay for the error case (defeats the feature's purpose for exactly the data-loss path) |
| Keep the renderer `deleteBusy` guard even though native dialogs are modal | FR-012: while a trash operation runs after the dialog closed, a second delete prompt must not open; the guard is the only thing preventing it | Relying on the dialog's modality alone (it is gone once a button is clicked; the async op window is unguarded) |

## Decision log (2026-08-04)

- Spec Clarification: the folder-open unsaved-changes confirmation (existing
  surface from spec 004, FR-010) is added to the Dialog Inventory as item 9 so
  the whole app converts consistently; it offers the same Save All / Discard /
  Cancel outcomes natively.
- `buildNativeDialogOptions` returns an electron-free options shape (same field
  names as `MessageBoxOptions` minus `signal`/`icon`); main passes it straight
  to `showMessageBox`. No `MessageBoxOptions` type import crosses into shared.
- Defaults: delete-to-trash may default to the delete/commit action (recoverable
  and platform-expected); permanent-delete always defaults to Cancel.
- Mnemonics dropped: `&`-labels with `normalizeAccessKeys` were planned but
  break GTK's stock-button localization on Linux (Electron's `TranslateToStock`
  lowercases the whole label, so `&Cancel` ≠ `cancel`); native message boxes
  already provide Tab/Return/Escape keyboard access, so FR-013 is unaffected.
- `noLink: true` on Windows (user feedback, 2026-08-04): Electron renders
  non-common button labels as command links by default, so the unsaved-changes
  box showed "Save"/"Don't Save" as stacked command links instead of the native
  `[Save] [Don't Save] [Cancel]` row. Setting `noLink` makes every label a
  standard push button — the VS Code-style Windows look.
- `title` left empty: the OS fills the application name into the window title
  (Windows), ignores it (macOS), or shows the app name (GTK) — matching the
  native convention instead of a per-dialog string. The `message`/`detail`
  carry all meaning (research R3).
- Unsaved-changes wording aligned to the native convention: message is the
  direct question ("Do you want to save the changes you made to X?"), detail is
  the consequence ("Your changes will be lost if you don't save them.") plus the
  affected-document list and any re-prompt error.
- `package.json` gains `"productName": "Another Markdown Editor"` so the
  dialog window title (and packaging) use the human name, matching
  `src/renderer/index.html`'s `<title>`.
