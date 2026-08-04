# Renderer Contract: Native Dialogs

**Feature**: `008-native-dialogs` | **Date**: 2026-08-04

## IPC surface (new operations)

| Channel | Request | Response | Notes |
|---------|---------|----------|-------|
| `dialog:show` | `NativeDialogRequest` | `Result<NativeDialogDecision>` | Shows the platform-native message box for the requested kind (modal to the window; a sheet on macOS). Main validates the request (closed kind set, string/array types, length caps), builds platform options from `src/shared/nativeDialog.ts`, awaits `dialog.showMessageBox`, and maps the clicked index to a semantic decision. Errors use the existing `IO` code only; the request never carries paths. |

The quit handshake is unchanged: `app:quitRequested` (main → renderer event)
then `quit:respond` (`confirmQuit`). The new dialog op only changes *how the
renderer prompts*, not that handshake.

## Preload API

```ts
showConfirmation(request: NativeDialogRequest): Promise<Result<NativeDialogDecision>>
```

Added to `DesktopApi`; exposed via `contextBridge` as one named operation (no
generic `invoke`). `NativeDialogRequest`/`NativeDialogDecision` are the closed
unions in `src/shared/ipc-contract.ts`.

## Per-platform button contract (authoritative)

`buildNativeDialogOptions(platform, request)` returns these arrays. **Array
order is what Electron receives.** On Windows and Linux the array order is the
visual left→right order; on macOS `buttons[0]` renders at the far RIGHT
(Apple: "placed starting near the right side … going toward the left") and
later buttons extend left — so the macOS arrays below are written reversed
relative to their visual order (research R2).

`defaultId` = Enter/Return default; `cancelId` = the index returned by
Escape / window close / OS cancel. For irreversible actions both point at the
safe button (FR-006, US1 scenario 4).

### `unsaved-close` — Save / Don't Save / Cancel

| Platform | Visual (left → right) | buttons (array) | defaultId | cancelId |
|----------|-----------------------|-----------------|-----------|----------|
| win32 | Save, Don't Save, Cancel | `['Save', 'Don''t Save', 'Cancel']` | 0 | 2 |
| darwin | Don't Save, Cancel, Save | `['Save', 'Cancel', 'Don''t Save']` | 0 | 1 |
| linux | Cancel, Don't Save, Save | `['Cancel', 'Don''t Save', 'Save']` | 2 | 0 |

### `unsaved-quit` — Save All / Discard and Quit / Cancel

| Platform | Visual | buttons (array) | defaultId | cancelId |
|----------|--------|-----------------|-----------|----------|
| win32 | Save All, Discard and Quit, Cancel | `['Save All', 'Discard and Quit', 'Cancel']` | 0 | 2 |
| darwin | Discard and Quit, Cancel, Save All | `['Save All', 'Cancel', 'Discard and Quit']` | 0 | 1 |
| linux | Cancel, Discard and Quit, Save All | `['Cancel', 'Discard and Quit', 'Save All']` | 2 | 0 |

### `folder-open` — Save All / Discard / Cancel (same layout as `unsaved-quit`)

| Platform | buttons (array) | defaultId | cancelId |
|----------|-----------------|-----------|----------|
| win32 | `['Save All', 'Discard', 'Cancel']` | 0 | 2 |
| darwin | `['Save All', 'Cancel', 'Discard']` | 0 | 1 |
| linux | `['Cancel', 'Discard', 'Save All']` | 2 | 0 |

### `external-changed` — Keep My Version / Reload from Disk (default = Keep: safe)

| Platform | Visual | buttons (array) | defaultId | cancelId |
|----------|--------|-----------------|-----------|----------|
| win32 | Keep My Version, Reload from Disk | `['Keep My Version', 'Reload from Disk']` | 0 | 0 |
| darwin | Reload from Disk, Keep My Version | `['Keep My Version', 'Reload from Disk']` | 0 | 0 |
| linux | Reload from Disk, Keep My Version | `['Reload from Disk', 'Keep My Version']` | 1 | 1 |

### `external-removed` — OK / Save As... (default = Save As: expected, non-destructive)

| Platform | Visual | buttons (array) | defaultId | cancelId |
|----------|--------|-----------------|-----------|----------|
| win32 | Save As..., OK | `['Save As...', 'OK']` | 0 | 1 |
| darwin | OK, Save As... | `['Save As...', 'OK']` | 0 | 1 |
| linux | OK, Save As... | `['OK', 'Save As...']` | 1 | 0 |

### `delete-to-trash` — Delete / Cancel (delete is recoverable; default where platform-expected)

| Platform | Visual | buttons (array) | defaultId | cancelId |
|----------|--------|-----------------|-----------|----------|
| win32 | Delete, Cancel | `['Delete', 'Cancel']` | 0 | 1 |
| darwin | Cancel, Delete | `['Delete', 'Cancel']` | 0 | 1 |
| linux | Cancel, Delete | `['Cancel', 'Delete']` | 1 | 0 |

### `permanent-delete` — Delete Permanently / Cancel (**default = Cancel everywhere**: irreversible)

| Platform | Visual | buttons (array) | defaultId | cancelId |
|----------|--------|-----------------|-----------|----------|
| win32 | Delete Permanently, Cancel | `['Delete Permanently', 'Cancel']` | 1 | 1 |
| darwin | Delete Permanently, Cancel | `['Cancel', 'Delete Permanently']` | 0 | 0 |
| linux | Delete Permanently, Cancel | `['Delete Permanently', 'Cancel']` | 1 | 1 |

### `delete-blocked` / `operation-failed` — single OK

| Platform | buttons (array) | defaultId | cancelId |
|----------|-----------------|-----------|----------|
| all | `['OK']` | 0 | 0 |

On Windows `noLink: true` is set so EVERY label renders as a standard push
button in a row — the native Windows look (VS Code-style `[Save] [Don't Save]
[Cancel]`), not the command-link style Electron would otherwise use for
non-common labels (decision log 2026-08-04). `type` is `'warning'` for every
kind except `operation-failed` (`'error'`). No `&` mnemonics /
`normalizeAccessKeys` are used: they would break GTK's stock-label localization
of `Cancel`/`OK` on Linux (Electron lowercases the whole label before matching
the stock set), and native boxes already provide Tab/Return/Escape keyboard
access (FR-013, decision log 2026-08-04).

## Label contract

The `title` is empty on every kind: Windows fills the application name into the
window title, macOS ignores the title entirely, and GTK shows the app name —
the native convention (research R3).

- `message` strings: the bold question line per kind —
  `unsaved-close`: `"Do you want to save the changes you made to {documentTitle}?"`
  with `detail` = `"Your changes will be lost if you don't save them."` (+ re-prompt
  error); `unsaved-quit`: `"Do you want to save the changes you made?"` with
  `detail` listing titles + the same consequence line; `folder-open`:
  `"Open folder with unsaved changes?"` with `detail` listing titles + the same
  consequence line; `external-changed`: `"{documentTitle} was modified by another program. Keep your version, or replace it with the version on disk?"`;
  `external-removed`: `"{documentTitle} was deleted or renamed on disk. Its content is still open here; you can save it to a new location."`;
  `delete-to-trash`: `"Delete {targetName}?"` with `detail` = `deleteDescription`
  + clean-to-close list + "It will be moved to the recycle bin or trash.";
  `permanent-delete`: `"Trash unavailable"` + `detail` = target, clean-to-close
  list, "Deleting it permanently cannot be undone." + "Delete permanently anyway?";
  `delete-blocked`: `"Cannot delete"` + `detail` lists blocker titles;
  `operation-failed`: `"Operation failed"` with `detail` = the scrubbed IPC
  message.
- `detail` on re-prompt carries the `error` detail (failed-save explanation,
  research R5).

## Error and edge behaviour

- **Malformed request**: main rejects with `Result` error branch (`IO`); no
  dialog is shown; the renderer surfaces the failure in context and the session
  is unchanged.
- **One dialog at a time**: `showMessageBox(window)` is modal to the window; the
  spec's "one prompt at a time" edge case holds. On macOS the box is a
  window-attached sheet.
- **FR-012**: a `delete`/`delete-permanent` decision closes the dialog and the
  renderer's `deleteBusy` guard prevents a second delete prompt while
  `trashEntry` runs; no cancellation is offered during the operation.
- **Escape / close / OS cancel** return the `cancelId` decision on every
  platform — always the safe cancellation outcome (research R2).
- **Failed save during close/quit/folder-open**: re-prompt with the same
  request + `error`; the document(s) stay open and unsaved (US2 scenario 4).
- **Renderer strings are untrusted text**: length-bounded in main; no paths
  cross the boundary; nothing is interpreted (Principle II).

## Tests that must exist

- `tests/renderer/nativeDialog.test.ts` — for every kind and every platform
  (`win32`/`darwin`/`linux`, plus an unknown platform falling back to linux):
  exact `buttons` array, `defaultId`, `cancelId`, `type`, `message`/`detail`
  content (incl. appended `error`), and `decisionFromResponse` for each index.
  Also: permanent-delete never defaults to the destructive index; the macOS
  arrays are the reverse of their visual order.
- `tests/main/ipc.test.ts` — shape tests: `NativeDialogRequest` union members
  compile, `NativeDialogDecision` is a closed set, `DesktopApi.showConfirmation`
  signature.
- `tests/main/dialogValidation.test.ts` — behavioral tests for
  `validateNativeDialogRequest`: every kind accepted, unknown kind rejected,
  `MAX_STRING`/`MAX_LIST`/`MAX_ERROR` caps, non-string fields rejected
  ("Malformed request" edge case).
- `tests/renderer/quit.test.tsx` — updated: drop the `ConfirmDialog` render
  assertions; keep `planClose`/`planQuit` coverage.
- `tests/e2e/*.spec.ts` — `dialog.showMessageBox` stubbed in main via
  `electronApp.evaluate` (helper in `tests/e2e/launch.ts`); each decision
  path is exercised and the renderer outcome asserted (close/quit save-discard-
  cancel, external keep/reload, external-removed ok/save-as **and deleted-on-disk
  prompt (currently untested — gap)**), delete/trash/permanent-delete/blocked,
  folder-open confirmation, operation-failed, and the failed-save re-prompt.
