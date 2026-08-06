# Quickstart: Settings Dialog

Manual verification script for `012-settings-dialog`. Automated coverage lives
in `tests/e2e/settings.spec.ts`; these steps prove the same flows by hand.

## Prerequisites

- `npm install`, `npm run build` (or `npm run dev`).
- A scratch folder with a markdown file, e.g. `~/scratch/notes.md`.

## 1. Open the settings dialog from the hamburger (US1, FR-001)

1. Launch the app. Click the hamburger (`☰`, top-left).
2. Confirm a **Settings…** item is present after `Toggle Developer Tools`.
3. Click **Settings…**. A modal titled **Settings** appears.
4. The first setting shown is **Editor Font** with two options: **Sans-serif**
   and **Serif**.
5. **Expected**: the dialog opens without touching any open document.

## 2. Choose the editor font (US2, FR-003/004/005)

1. With the dialog open, select **Serif**.
2. **Expected**: the WYSIWYG editing surface immediately renders in a serif
   face (a `Georgia`-style font); the rest of the chrome (hamburger, tabs,
   footer) does not change.
3. The choice is applied and saved immediately — there is no Save button.

## 3. Current choice is shown on reopen (FR-007)

1. Close the dialog (Close button or Escape).
2. Reopen Settings… .
3. **Expected**: the **Serif** radio is selected.

## 4. Persistence across restarts (US3, FR-006)

1. With **Serif** selected, quit and relaunch the app.
2. Open a document.
3. **Expected**: the editor still renders in serif.
4. On the filesystem, `~/.config/ame/config.json` (Linux) / `%APPDATA%\ame\config.json`
   (Windows) / `~/Library/Application Support/ame/config.json` (macOS) contains
   `"settings": { "editorFont": "serif", ... }` alongside `recentItems`.

## 5. The dialog never loses work (US4, FR-008)

1. Open a document and type text (the tab shows the dirty dot).
2. Open Settings…, switch fonts, close the dialog.
3. **Expected**: the typed text and the dirty dot are unchanged.

## 6. Keyboard accessibility (FR-007)

1. Tab to the hamburger, Enter to open, Tab to **Settings…**, Enter.
2. Tab to the font radios; use arrow keys to change the selection.
3. **Expected**: selection changes and the editor updates.
4. Press Escape. **Expected**: the dialog closes and focus returns to the
   hamburger.

## 7. Missing / malformed config tolerance (FR-009)

1. Quit the app. Delete (or corrupt) `config.json`.
2. Relaunch and open Settings… .
3. **Expected**: the dialog opens with **Sans-serif** selected (defaults).
4. Select **Serif**. **Expected**: a valid `config.json` is written and the
   change persists.

## 8. Regression: Recent Items still works

1. Open a file or folder, then open the hamburger → Recent Items.
2. **Expected**: the entry appears and opens correctly — settings and recent
   items now share `config.json` without interfering.
