# Quickstart: Native Dialogs

**Feature**: `008-native-dialogs` | **Date**: 2026-08-04

Manual end-to-end validation of the feature. Runs against `npm run dev`.

**You must run this on Windows, macOS, AND Linux** — the point of the feature is
that each OS shows its own conventions (FR-003). On Linux note that appearance
follows the active desktop environment.

## 1 — US1/US2: unsaved-changes dialogs look and behave natively

1. Open a file, type something (do not save), click the tab **×**.
   - Expected: a **native** message box. Windows: `Save / Don't Save / Cancel`
     with **Save** highlighted (default) and **Cancel** last. macOS: a sheet
     `Don't Save  Cancel  Save` with **Save** on the right and default (Return
     works, Escape cancels). Linux: `Cancel  Don't Save  Save` with **Save**
     default.
2. Press **Escape**. Expected: the box dismisses and the tab stays open and
   dirty.
3. Click **Save** (or Return). Expected: the file saves and the tab closes.
4. Repeat, choosing **Discard**: the tab closes and the edits are gone.
5. Now make two files dirty, press Ctrl+W (or close the window / Cmd+Q):
   - Expected: a native **"Do you want to save the changes you made?"** box
     listing **both** documents, with Save All / Discard and Quit / Cancel in the
     platform order.
   - **Cancel** keeps the window open with both documents dirty.

## 2 — US2 scenario 4: failed save re-prompts

1. Make a file dirty, then make it read-only or delete the directory behind it.
2. Close its tab and choose **Save**.
   - Expected: the save fails, the **same native dialog re-appears with the
     failure explained**, and the document is still open and unsaved.
3. Choose **Discard** or **Cancel** to finish. Expected: standard outcomes.

## 3 — US3: external file change / deletion

1. Open a file, edit it (do not save). From a terminal
   `echo '# external' > that-file.md`:
   - Expected: a native **modified by another program** box; **Keep My Version**
     is the default (safe). **Reload from Disk** replaces your in-memory version.
2. Repeat but now delete the file on disk:
   - Expected: a native box explaining the file was deleted/renamed and its
     content is still open, with **Save As...** default. **Save As...** writes
     it elsewhere; **OK** keeps it open in memory.

## 4 — US3: delete to trash, permanent fallback, blocked delete

1. Delete a markdown file from the tree (context menu → Delete):
   - Expected: a native box identifying the target and stating it will move to
     trash/recycle bin. **Cancel** does nothing; **Delete** trashes it.
2. (Windows/macOS) Rename the file, then delete a folder whose subtree contains
   a dirty document:
   - Expected: a native **Cannot delete** box listing the blocking document(s).
     **OK** dismisses without deleting.
3. Force trash-unavailable (e.g. stub in e2e, or on a system without a trash):
   - Expected: a native box stating **deleting it permanently cannot be undone**
     with **Cancel** as the DEFAULT on every OS (never the destructive button).
     **Delete Permanently** is the only way through.

## 5 — US4: operation failed

1. Trigger a failing operation (e.g. try to open a file you deleted between the
   dialog and the open; or rename over an existing name).
   - Expected: a native **Operation failed** box with the (path-scrubbed)
   message and a single **OK**.

## 6 — Keyboard and accessibility (FR-013)

1. While any native box is open: press **Return** (default), **Escape**
   (cancel), and **Tab/Shift-Tab** between buttons.
   - Expected: the platform's standard behaviour, including announcing title,
   purpose, choices and default action with a screen reader (macOS VoiceOver,
   Windows Narrator, Linux Orca).

## 7 — Folder-open confirmation (Clarification 2026-08-04)

1. With a dirty workspace-relative document, File > Open Folder and pick a new
   folder:
   - Expected: a native **Open folder with unsaved changes?** box listing the
     document. **Cancel** leaves the workspace, edits and recent entry
     unchanged; **Save All** saves and opens; **Discard** opens the new folder.

## Automate

```text
npm run lint && npm run typecheck && npm run test && npm run test:e2e
```
