# Research & Technical Decisions: Native Dialogs

**Feature**: `008-native-dialogs` | **Date**: 2026-08-04

Every decision below was verified against the installed packages and this
repository (electron 43.2.0, react 19, crepe 7.21.3, vitest 4, playwright 1.62)
and against the Electron v43.2.0 source and platform documentation.

## R1 — Native message boxes are main-process, one `showMessageBox` call

**Finding**: The app currently shows every confirmation as the custom React
`ConfirmDialog` component (`src/renderer/dialogs/ConfirmDialog.tsx`), rendered
from one conditional chain in `App.tsx:984-1137`. A grep of `src/` on
2026-08-04 found zero `showMessageBox`/`showMessageBoxSync`/`window.confirm`/
`window.alert` uses — the only native dialogs are the three pickers in
`handlers.ts` (`dialog.showOpenDialog` at 266 and 379, `dialog.showSaveDialog`
at 481), which the spec explicitly excludes (spec Assumptions).

**Decision**: Use `dialog.showMessageBox(window, options)` (the async form) in
the main process for every inventory surface. The renderer triggers it through a
single new named IPC operation (`dialog:show` → `DesktopApi.showConfirmation`)
whose request is the closed `NativeDialogRequest` union and whose response is a
semantic `NativeDialogDecision`. All decision logic remains renderer-side —
the quit flow already proves this pattern (`app:quitRequested` →
`quit:respond` in `handlers.ts:119-125,628-633`).

**Evidence**:

- `dialog` module API (Electron 43 docs, `electron.d.ts:7728-7763`):
  `showMessageBox(window, options): Promise<MessageBoxReturnValue>` where
  `MessageBoxReturnValue = { response: number, checkboxChecked: boolean }`;
  `MessageBoxOptions` supports `type`, `buttons`, `defaultId`, `title`, `detail`,
  `cancelId`, `noLink`, `normalizeAccessKeys` (`electron.d.ts:22208-22283`).
- The async form avoids blocking the main process; the sync form is only for
  cases that cannot be async.
- The `window` argument makes the dialog modal to the window (and a sheet on
  macOS — docs "Sheets" section).

**Why async and not sync**: `showMessageBoxSync` blocks the main process while
the box is open, freezing IPC and the window; the async form is the documented
default for Electron ≥ 3.

**Alternatives rejected**: `window.confirm`/`alert` (not native, web-style,
renderer-only, and the sandboxed renderer has no windowing anyway);
`dialog.showErrorBox` (message boxes only, no buttons); keeping `ConfirmDialog`
(styled in-app, violates FR-001/002/003).

## R2 — Button order must be authored per platform; macOS reverses the array

**Finding**: The three platform implementations in Electron 43.2.0 render the
`buttons` array differently, so one literal array cannot be correct on all
platforms (FR-003: "MUST NOT impose one operating system's order on another").

**Decision**: Author one buttons array per (kind, platform) in the shared layout
module `src/shared/nativeDialog.ts`, with `defaultId`/`cancelId` set per
platform. The renderer never sees the array or the index — main maps the
response index to a decision via the same shared module. On Windows the layout
additionally sets `noLink: true`: Electron's default would render non-common
labels (Save, Don't Save, Reload…) as command links, whereas native Windows
apps show standard push buttons in a row (`[Save] [Don't Save] [Cancel]`) — the
look requested for this feature (decision log 2026-08-04).

**Evidence** (from the Electron v43.2.0 source):

- **Windows** — `shell/browser/ui/message_box_win.cc` uses
  `TaskDialogIndirect`. Buttons render left→right in array order. `MapToCommonID`
  maps `ok/yes/no/cancel/retry/close` labels to common task-dialog buttons; any
  other label becomes a command link (`TDF_USE_COMMAND_LINKS`) unless `noLink`
  is set — the modern Windows look. `nDefaultButton` = `defaultId`. On cancel
  (Escape/close), the dialog returns `cancelId`
  (`else button_id = cancel_id;`). Windows convention (Microsoft dialog
  guidelines, observed Windows 10/11 native apps): the commit/primary action
  first (leftmost) and default, Cancel last.
- **macOS** — `shell/browser/ui/message_box_mac.mm` builds an `NSAlert` via
  `addButtonWithTitle:` in array order. Apple's `NSAlert.addButton(withTitle:)`
  documents: "Buttons are placed starting near the right side of the alert and
  going toward the left side". The Electron source confirms the first array
  element is the default until overridden ("The first button added gets set as
  the default selected, so remove that and set the button @ default_id to be
  default") and binds Escape to `cancelId`. Net effect: `buttons[0]` renders at
  the FAR RIGHT (the macOS default position) and later buttons extend left — the
  array order is the visual order reversed. Convention (Apple HIG): default
  (Return) at the far right, e.g. the classic `[Don't Save] [Cancel] [Save]`
  with Save default.
- **Linux** — `shell/browser/ui/message_box_gtk.cc` uses `GtkMessageDialog`.
  Buttons render left→right in array order; `gtk_dialog_set_default_response`
  sets the default; a negative response (Escape/close) returns `cancelId`
  (`return (response < 0) ? cancel_id_ : response;`). Stock labels `cancel`,
  `ok`, `yes`, `no` are localized by GTK. Convention: Cancel left, primary
  right.
- `cancelId` semantics are identical everywhere: the index returned when the
  user cancels via Escape / window close — so it must always point at the safe,
  cancellation-equivalent button.

**Alternatives rejected**: a single cross-platform order (violates FR-003);
rendering buttons in the renderer in a platform-ordered way while still showing
a web dialog (not native, FR-001/002); hard-coding macOS array order from memory
without the source evidence above (risked getting the direction backwards).

## R3 — `message`/`detail` carry the meaning; `title` is not reliable

**Finding**: The spec's dialogs show a heading, body text, sometimes a list of
affected documents, and sometimes an error line. Native boxes have `message`,
`detail`, and `title`, and the platforms treat them differently.

**Decision**: `message` = the bold question/statement line (macOS
`setMessageText`, Windows main instruction, GTK primary text); `detail` = the
supplementary text — affected-document list, delete-plan warnings (from
`deleteDescription`, `operations.ts:84-93`), and the re-prompt error. `title` =
a short window title; it is shown on Windows, ignored by macOS
(`message_box_mac.mm`: "Ignore the title; it's the window title on other
platforms and ignorable"), and may be hidden on some Linux desktops — so the
meaning never lives in `title` alone.

**Evidence**: `message_box_mac.mm` sets `messageText` from `message` and
`informativeText` from `detail`; `message_box_win.cc` maps `message` to the main
instruction and `detail` to the content when both are non-empty;
`message_box_gtk.cc` uses `message` as primary and
`gtk_message_dialog_format_secondary_text` for `detail`.

**Alternatives rejected**: putting the question only in `title` (invisible on
macOS); cramming the affected-document list into `message` (overwhelms the bold
line; `detail`/secondary text is the platform-appropriate home for it).

## R4 — Native appearance is not automatable; e2e stubs the message box

**Finding**: Playwright's Electron driver cannot see or click native message
boxes; only the renderer DOM is accessible. The repo's AGENTS.md already
mandates stubbing native dialogs in the main process via `electronApp.evaluate`
— the e2e specs already stub `dialog.showOpenDialog` and `shell.trashItem` this
way (tabs.spec.ts:28-33, organize.spec.ts:67-73,397-401).

**Decision**: e2e stubs `dialog.showMessageBox` with
`app.evaluate(({ dialog }) => { ... dialog.showMessageBox = async () => ({ response: N, checkboxChecked: false }) })` — a shared helper in
`tests/e2e/launch.ts` — and asserts renderer outcomes for each decision
(document closed/saved/kept, `entry:trash` invoked, session intact, failed-save
re-prompt). The per-platform *visual* contract (order, default, emphasis) is
asserted only in the pure-function unit tests
(`tests/renderer/nativeDialog.test.ts`) and verified manually per OS in
quickstart.md.

**Evidence**: every existing spec races `app.waitForEvent('close')` against a
click on the renderer quit-dialog ("Discard and Quit" button) — those clicks
must become stub-driven decisions (tabs.spec.ts:40-59 et al.).

**Alternatives rejected**: driving native dialogs through OS automation
(Playwright Electron has no such API; flaky and non-portable); screenshot
goldens per OS (no CI machines for all three OSes); leaving the renderer dialog
for e2e and only converting visually (two code paths, defeats FR-014).

## R5 — A failed save re-prompts instead of an inline error

**Finding**: The current `ConfirmDialog` keeps the dialog open and renders an
inline `.dialog-error` when a save during close/quit/folder-open fails
(`App.tsx:248,279,299-302`, CSS `App.css:227-231`). A native `showMessageBox`
resolves the moment a button is clicked — there is no "stays open" state.

**Decision**: On a failed save the renderer calls `showConfirmation` again with
the identical request plus an `error` detail appended to `detail`, so the user
sees the same choices with the failure explained. The affected document stays
open and dirty (US2 scenario 4: "the failure is explained without treating the
dialog as resolved").

**Evidence**: US2 scenario 4 and FR-007/008 require save-failure to keep the
work open and unsaved and to explain the failure; only the presentation of the
explanation differs from today.

**Alternatives rejected**: a hybrid overlay for the error case (introduces a
second, non-native dialog style for exactly the data-loss path); silently
swallowing the failure (violates Principle III); treating the re-prompt as
"resolved" and discarding (violates FR-007/008).

## Decisions validated against the constitution

| Principle | Check |
|-----------|-------|
| I. Process Isolation Is Absolute | `showMessageBox` lives in main; renderer gains one named op over a closed union; no generic `invoke`, no dialog handle crosses the bridge |
| II. Every Path Is Untrusted | No paths cross the dialog IPC; renderer strings are length-bounded untrusted text |
| III. Never Lose The User's Words | Save/discard/cancel outcomes preserved; failed saves re-prompt with the document open and dirty |
| IV. Calm, Predictable Editing | Modal, user-action-driven; nothing on the keystroke path |
| V. Test What Can Corrupt Or Escape | Per-platform layout + decision mapping unit tests for every kind; e2e drives every decision path through the stub |
