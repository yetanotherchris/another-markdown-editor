# Data Model: Native Dialogs

**Feature**: `008-native-dialogs` | **Date**: 2026-08-04

## NativeDialogRequest (shared IPC contract)

A closed discriminated union describing every confirmation/status surface the
app can show natively. It carries only display strings and renderer-owned
state — **no filesystem paths** (Principle II). One `kind` per inventory item
(spec Dialog Inventory, extended by Clarification 2026-08-04 with item 9).

```ts
type NativeDialogRequest =
  | { kind: 'unsaved-close';       documentTitle: string; error?: string }
  | { kind: 'unsaved-quit';        documentTitles: string[]; error?: string }
  | { kind: 'folder-open';         documentTitles: string[]; error?: string }
  | { kind: 'external-changed';    documentTitle: string }
  | { kind: 'external-removed';    documentTitle: string; error?: string }
  | { kind: 'delete-to-trash';     targetName: string; detail: string; cleanToCloseTitles: string[] }
  | { kind: 'permanent-delete';    targetName: string; detail: string; cleanToCloseTitles: string[] }
  | { kind: 'delete-blocked';      targetName: string; blockerTitles: string[] }
  | { kind: 'operation-failed';    message: string }
```

| Field | Source (renderer) | Invariant |
|-------|-------------------|-----------|
| `documentTitle` / `targetName` | open document title / tree node name | non-empty string; trimmed |
| `documentTitles` | dirty-doc titles (quit / folder-open) or blocker titles (delete-blocked) | non-empty array; order preserved for the list |
| `cleanToCloseTitles` | `DeletePlan.cleanToClose` (`operations.ts:55-62`) | titles of clean tabs that will close |
| `detail` | `deleteDescription(info)` (`operations.ts:84-93`) + optional cleanToClose lines | may be empty; never contains absolute paths |
| `error` | `dialogError` re-prompt detail | optional; appended to `detail` by the layout builder |
| `message` | the IPC failure message (already scrubbed by main, `scrubPaths`) | operation-failed only |

Rules:

- Main validates each kind's fields (string/array-of-string types, length caps
  on strings and arrays) and rejects malformed requests with `Result` error
  branch (`IO`).
- Renderer strings are length-bounded by main before reaching
  `showMessageBox`; they are display text only and never interpreted.
- The same request, with `error` added, is re-sent after a failed save so the
  dialog re-prompts with the failure explained (research R5, US2 scenario 4).

## NativeDialogDecision (shared IPC contract)

The semantic outcome of a dialog — what the renderer acts on. The renderer
never receives a button index or the platform.

```ts
type NativeDialogDecision =
  | 'save' | 'discard' | 'save-all' | 'discard-all'
  | 'keep' | 'reload' | 'ok' | 'save-as'
  | 'delete' | 'delete-permanent' | 'acknowledge' | 'cancel'
```

Per-kind allowed outcomes:

| Kind | Possible decisions | Renderer action on each |
|------|--------------------|-------------------------|
| `unsaved-close` | `save` / `discard` / `cancel` | save→save then close; discard→close; cancel→keep open |
| `unsaved-quit` | `save-all` / `discard-all` / `cancel` | save-all→save each then `confirmQuit('quit')`; discard-all→`confirmQuit('quit')`; cancel→stay |
| `folder-open` | `save-all` / `discard-all` / `cancel` | same pattern, then `commitFolderOpen` |
| `external-changed` | `keep` / `reload` | keep→do nothing; reload→`reloadDocument(doc, true)` |
| `external-removed` | `ok` / `save-as` | ok→keep open in memory; save-as→save to new location |
| `delete-to-trash` | `delete` / `cancel` | delete→`trashEntry(path)`; cancel→nothing |
| `permanent-delete` | `delete-permanent` / `cancel` | delete-permanent→`trashEntry(path, true)`; cancel→nothing |
| `delete-blocked` | `acknowledge` | dismiss; nothing changes |
| `operation-failed` | `acknowledge` | dismiss |

`cancel` is the decision returned by the platform's Escape / window-close /
cancel action whenever the platform's `cancelId` button is the safe
cancellation choice; it is distinct per kind only in renderer handling above.

## NativeDialogLayout (shared, electron-free)

What `buildNativeDialogOptions(platform, request)` returns; the same field
names as Electron's `MessageBoxOptions` minus `signal`/`icon` so main can pass
it to `dialog.showMessageBox` unchanged.

```ts
interface NativeDialogLayout {
  type: 'none' | 'info' | 'question' | 'warning' | 'error'
  title: string
  message: string
  detail: string
  buttons: string[]
  defaultId: number
  cancelId: number
  /** Windows only: render every button as a standard push button (VS Code-style
   *  `[Save] [Don't Save] [Cancel]`), not command links. */
  noLink?: boolean
}
```

`title` is always empty — the OS fills the application name into the window
title (Windows), ignores it (macOS), or shows the app name (GTK). `noLink: true`
is set on Windows so non-common labels (Save, Don't Save, Reload…) render as
standard buttons rather than the command-link style Electron defaults to
(decision log 2026-08-04). `normalizeAccessKeys` is NOT used: plain labels keep
GTK stock-button localization (decision log 2026-08-04).

Mapping rules (research R2/R3):

- `message` = the bold question/statement line; `detail` = supplementary text
  (affected-document list, delete-plan warnings, appended `error`).
- `type` is `'warning'` for unsaved-close, unsaved-quit, folder-open,
  external-changed, external-removed, delete-to-trash, permanent-delete,
  delete-blocked; `'error'` for operation-failed.
- Buttons, `defaultId`, `cancelId` are the per-(kind, platform) table in
  `contracts/renderer.md`. `buttons[0]` renders far right on macOS (default
  position), leftmost on Windows/Linux.
- Plain button labels (no `&` mnemonics): `&` would break GTK stock-label
  localization of `Cancel`/`OK`; native Tab/Return/Escape already cover
  keyboard access (FR-013, decision log 2026-08-04).

## Derived / state transitions

- **show (renderer → main)**: a pending-dialog state (`pendingCloseId`,
  `quitDirtyDocs`, `externalPrompt`, `deleteTarget`, `permanentDelete`,
  `deleteRefused`, `operationError`, `pendingFolderOpen`) triggers
  `window.api.showConfirmation(request)`; main validates, shows the modal native
  box, and returns `Result<NativeDialogDecision>`.
- **decide (renderer)**: the existing handlers (`handleCloseDecision`,
  `handleQuitDecision`, `handleExternalDecision`, `handleDeleteConfirm`,
  `handleDeletePermanent`, `handleFolderOpenDecision`) dispatch on the decision;
  outcomes are unchanged from today (table above).
- **failed save (renderer)**: a `save`/`save-all` decision whose save fails
  clears no state, sets the re-prompt `error`, and re-invokes
  `showConfirmation` with the same request + `error` — the dialog re-prompts and
  the document stays dirty (research R5).
- **destructive in progress (renderer)**: the single decision-surface guard
  (`dialogInFlightRef`) stays held across `describeEntry` + the whole
  `trashEntry` operation (FR-012): no second delete dialog can open and no
  cancellation is offered while the operation runs. Releasing the guard drains
  any queued operation error.
- **quit continuation (renderer)**: `save-all`/`discard-all` end in
  `confirmQuit('quit')`; `cancel` ends the flow (window stays). The
  `app:quitRequested` → `quit:respond` handshake is unchanged
  (`handlers.ts:119-125,628-633`).
- **cancel path (platform)**: Escape / window close / OS cancel returns the
  `cancelId` button's decision on every platform (`message_box_*` sources,
  research R2) — always the safe cancellation outcome.
