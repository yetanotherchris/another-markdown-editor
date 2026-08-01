# Phase 1 Quickstart: Desktop Markdown Editor

**Feature**: `001-markdown-editor` | **Date**: 2026-08-01

How to verify the application boots end-to-end after the implementation phase.
This is a manual smoke-test script, not a test suite.

## Prerequisites

```bash
git clone https://github.com/yetanotherchris/another-markdown-editor
cd another-markdown-editor
npm install
```

## Start the application

```bash
npm run dev
```

Expected: a window appears with a File menu and an empty resizable split.

## Smoke test 1 — Open a folder

1. Choose **File → Open Folder...** (or the sidebar button).
2. Select a folder containing at least one `.md` file.
3. Expected: the sidebar shows a tree. Non-markdown files are **not** listed.

## Smoke test 2 — Edit a file

1. Click a `.md` file in the sidebar.
2. Type a sentence. Expected: the tab title shows a dot or other dirty indicator.
3. Choose **File → Save** (or `Ctrl/Cmd+S`).
4. Expected: the dirty indicator disappears; the file on disk contains the new
   content.
5. Re-open the file: it should load the saved content.

## Smoke test 3 — Multiple tabs

1. Open a second file.
2. Edit it.
3. Switch back to the first file. Expected: your second edit is still present
   in the second tab, and the first tab shows the cursor where you left it.
4. Close the second tab with unsaved changes. Expected: a dialog asks Save,
   Discard, or Cancel.

## Smoke test 4 — Organize from the tree

1. Right-click a file → **Rename**. Give it a new name.
2. Expected: the tab title updates if that file was open, and the file is
   renamed on disk.
3. Right-click a folder → **New File**. Name it `test.md`.
4. Expected: `test.md` appears in the tree and on disk.
5. Delete the new file. Expected: a confirmation dialog appears, the file moves
   to the OS trash (or warns if trash is unavailable), and the tab closes if it
   was open.

## Smoke test 5 — Quit with dirty tabs

1. Open a file and edit without saving.
2. Close the window.
3. Expected: a dialog appears naming the dirty document and offering Save, Don't
   Save, or Cancel.

## Smoke test 6 — Path containment

1. Open a folder.
2. Create a file named `../escape.md` from the tree (if the UI permits typing
   it) or try to open a file outside the workspace.
3. Expected: operation is refused with an error, and no file is created or read
   outside the workspace.

## Smoke test 7 — Theme

1. Change the OS theme.
2. Expected: the editor follows the dark/light setting unless a manual theme
   override is active.

## Smoke test 8 — Layout persistence

1. Drag the sidebar divider.
2. Quit the application.
3. Restart.
4. Expected: the sidebar width is restored.

## Common issues

- **Window opens but tree is empty**: `readDir` handler may be failing
  silently. Check the main process console for the IPC response.
- **Save seems to work but the file is empty**: atomic write is failing before
  rename. Check the temporary file in the target directory.
- **Tab switch resets cursor or scroll**: hidden editor containers are being
  re-mounted or resized to zero. Verify the editor is kept alive and hidden
  with `visibility: hidden`.
- **Folder outside the workspace is accessed**: the path containment function is
  not resolving real paths; verify the symlink/traversal test cases.

## Next steps

After quickstart passes, run the automated test suites:

```bash
npm run test
```

This should cover the adversarial path containment suite, atomic write
interruption cases, dirty-state tracking, and IPC contracts.
