# Quickstart: Theme Setting

Manual verification script for `013-theme-setting`. Automated coverage lives in
`tests/e2e/theme.spec.ts`; these steps prove the same flows by hand.

## Prerequisites

- `npm install`, `npm run build` (or `npm run dev`).

## 1. Open the Theme setting (US1/2/3, FR-007)

1. Launch the app. Click the hamburger (`☰`) → **Settings…**.
2. Below **Editor Font**, confirm a **Theme** setting with three options:
   **Light**, **Dark**, **System default**.
3. **Expected**: the radio for **System default** is selected on a fresh install.

## 2. Choose the Light theme (US1, FR-002)

1. Select **Light**.
2. **Expected**: the chrome (header bar, tab strip, sidebar, status footer)
   immediately switches to a light palette; the window does not restart.
3. The choice is applied and saved immediately — there is no Save button.

## 3. Choose the Dark theme (US2, FR-003)

1. Select **Dark**.
2. **Expected**: the chrome immediately switches to a dark palette — dark header,
   dark sidebar, light-on-dark tabs and menus.
3. The WYSIWYG editing surface keeps its existing light appearance (FR-010).

## 4. Follow the OS theme (US3, FR-004/005)

1. Select **System default**.
2. Change the OS appearance (macOS: System Settings → Appearance; Windows:
   Settings → Personalization → Colors → "Dark"/"Light"; Linux: your desktop's
   color-scheme setting).
3. **Expected**: the application updates to match within seconds, without a
   restart. Switch back — the app follows again.

## 5. Persistence across restarts (US4, FR-006)

1. Select **Dark**, then quit and relaunch the app.
2. **Expected**: the chrome opens in dark. On the filesystem,
   `~/.config/ame/config.json` (Linux) / `%APPDATA%\ame\config.json` (Windows) /
   `~/Library/Application Support/ame/config.json` (macOS) contains
   `"settings": { "themeOverride": "dark", ... }` alongside `recentItems`.

## 6. The editor content area follows the theme (FR-010)

1. With **Dark** selected, open a markdown document.
2. **Expected**: the document canvas is a dark "page" — slightly lighter than the
   dark window chrome but clearly dark — with light text, headings, and code that
   remain fully readable. The source view (View source) uses the same dark surface.
3. Switch to **Light**. **Expected**: the editor returns to its existing light
   styling.

## 7. Keyboard accessibility (FR-007)

1. Open **Settings…** with the keyboard (hamburger focus → Enter → Tab to
   Settings… → Enter).
2. Tab to the Theme radios; use arrow keys to change the selection.
3. **Expected**: the chrome updates and the choice persists.
4. Press Escape. **Expected**: the dialog closes and focus returns to the
   hamburger.

## 8. Missing / malformed config tolerance (FR-009)

1. Quit the app. Delete (or corrupt) `config.json`.
2. Relaunch and open **Settings…**.
3. **Expected**: **System default** is selected (the `themeOverride` default).
4. Select **Dark**. **Expected**: a valid `config.json` is written and the theme
   persists.

## 9. Regression: Recent Items and settings coexist

1. Open a file or folder, then open the hamburger → Recent Items.
2. **Expected**: the entry appears and opens correctly — theme writes still
   preserve `recentItems` in the shared `config.json`.
