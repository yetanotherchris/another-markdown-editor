# Data Model: Editor Spellcheck

**Feature**: 020-editor-spellcheck | **Date**: 2026-08-07

## Entities

### Settings (spec: existing entity, extended)

`src/shared/ipc-contract.ts` `Settings` gains one field:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `spellcheckEnabled` | `boolean` | `true` | NEW (spec 020 FR-006/FR-009). Whether the native spellchecker is on. Persisted in `appData/ame/config.json` `.settings` via the existing validated store. A closed type — main validates it is a boolean. |

### Personal Dictionary (spec: Key Entities)

The user-maintained collection of words the spellchecker treats as valid.

| Aspect | Value |
|--------|-------|
| Where it lives | The Chromium profile of the app: `<userData>/Shared Dictionary` (LevelDB). On Windows/macOS also the OS custom dictionary. |
| Owner | Chromium + Electron (`session.addWordToSpellCheckerDictionary`); the app never reads or writes dictionary files (research R3). |
| Lifecycle | Created lazily by Chromium; words added by the user persist across restarts natively (FR-005). |
| Scope | Shared across all open documents and all views, in-session and across sessions (US3 S2/S3). |

## Settings transitions

| Action | Where | Effect |
|--------|-------|--------|
| Startup | `src/main/index.ts` (`whenReady`) | `applySpellcheckSetting(loadSettings().spellcheckEnabled)` before the window is created — the first paint already honours the persisted choice. |
| `settings:update` with `spellcheckEnabled` | `src/main/ipc/handlers/settings.ts` | Merged + validated in main, then `applySpellcheckSetting(updated.spellcheckEnabled)` applied to the session immediately (US4 S1). |
| User toggles in the dialog | `useSettingsState.handleSpellcheckChange` → `updateSettings` + `window.api.updateSettings` | Local state, renderer cache, and main all converge; the DOM `spellcheck` attributes update on the same render (R5). |

## DOM reflection (rendered, not persisted)

| Element | Mechanism |
|---------|-----------|
| WYSIWYG contenteditable (`.ProseMirror`) | `view.dom.spellcheck = spellcheckEnabled`, set at editor mount and on every setting change (R5). |
| Source-view `<textarea>` | React `spellCheck={spellcheckEnabled}` prop (replaces the current hard-coded `false`, R5). |

## Native state owned by Chromium (not modelled by the app)

- The active spelling marker for the word under a right-click (consumed by
  `webContents.replaceMisspelling`, R2).
- Whether the spellchecker is enabled (`session.defaultSession.isSpellCheckerEnabled()`).
- The configured spellcheck language (platform default, spec assumption).
