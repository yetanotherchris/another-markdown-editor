# Data Model: Editor Spellcheck

**Feature**: 020-editor-spellcheck | **Date**: 2026-08-07

## Entities

### Settings (spec: existing entity, extended)

`src/shared/ipc-contract.ts` `Settings` gains one field:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `spellcheckEnabled` | `boolean` | `true` | NEW (spec 020 FR-006/FR-009). Whether the native spellchecker is on. Persisted in `appData/ame/config.json` `.settings` via the existing validated store. A closed type — main validates it is a boolean. |
| `spellcheckLanguage` | `SpellcheckLanguage \| null` | `null` | NEW (2026-08-07). The explicit spellchecker language (`en-GB`/`en-US`), or `null` for the platform/system default. Closed union — validated in main. Applied via `session.setSpellCheckerLanguages` (research R8). |

### Personal Dictionary (spec: Key Entities)

The user-maintained collection of words the spellchecker treats as valid.

| Aspect | Value |
|--------|-------|
| Where it lives | A `spellcheckDictionary: string[]` top-level key in `appData/ame/config.json` (2026-08-07 — was the native Chromium Shared Dictionary for the old native engine). |
| Owner | Main process (`src/main/spellcheckDictionary.ts`), read/written atomically via `spellcheck:getWords`/`spellcheck:addWord` IPC; loaded into the renderer's JS checker at startup (research R9). |
| Lifecycle | Created lazily; words added by the user persist across restarts (FR-005) and are shared across all open documents. |
| Format | Lowercased, deduped, non-empty strings. |

## Settings transitions

| Action | Where | Effect |
|--------|-------|--------|
| Startup | `src/main/index.ts` (`whenReady`) | `applySpellcheckSetting(loadSettings().spellcheckEnabled)` before the window is created — the first paint already honours the persisted choice. |
| `settings:update` with `spellcheckEnabled` | `src/main/ipc/handlers/settings.ts` | Merged + validated in main, then `applySpellcheckSetting(updated.spellcheckEnabled)` applied to the session immediately (US4 S1). |
| User toggles in the dialog | `useSettingsState.handleSpellcheckChange` → `updateSettings` + `window.api.updateSettings` | Local state, renderer cache, and main all converge; the DOM `spellcheck` attributes update on the same render (R5). |

## DOM reflection (rendered, not persisted)

| Element | Mechanism |
|---------|-----------|
| WYSIWYG contenteditable (`.ProseMirror`) | The JS spellcheck plugin applies `ame-spelling-error` inline decorations over misspelled ranges (wavy-red underline). Native markers are disabled on this element (research R9). |
| Source-view `<textarea>` | React `spellCheck` prop reflecting the setting — native spellchecking (language from the session). |

## Renderer spellcheck runtime (2026-08-07, JS engine)

`src/renderer/editor/spellcheckRuntime.ts` holds the editor-independent state
the plugin reads: `enabled`, `language` (persisted setting, `null` = system
default resolved from the platform), `customWords` (Set, from the config), the
compiled `nspell` checker for the effective language, and a `version` bump +
listener notification on every change so all editors re-run their pass.
