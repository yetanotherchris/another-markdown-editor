# Quickstart: Editor Spellcheck

**Feature**: 020-editor-spellcheck | **Date**: 2026-08-07

Runnable validation guide proving the feature works end-to-end. For the design
rationale see `research.md`; for the settings/state details see `data-model.md`
and `contracts/spellcheck.md`.

## Prerequisites

- Node + npm installed.
- `npm install` run at the repo root.
- A spellcheck dictionary for the platform default language (Chromium's native
  spellchecker; the e2e suite uses an isolated profile).

## Commands

### Unit tests (menu action builder + settings)

```sh
npx vitest run tests/main/spellcheckMenu.test.ts tests/main/settings.test.ts
```

Expected: all pass. These cover the suggestion/add-to-dictionary action list and
the new `spellcheckEnabled` setting's load/merge/migration behaviour.

### Typecheck, lint, full unit suite

```sh
npm run typecheck
npm run lint
npm run test
```

Expected: clean. The pre-existing suites still pass — the new setting defaults
to `true`, so behaviour for existing configs is unchanged.

### E2E (builds, then launches Electron via Playwright)

```sh
npm run test:e2e -- spellcheck
```

Expected: the spellcheck spec passes, exercising the acceptance scenarios of
spec 020 against the real built app and the real native spellchecker.

## Manual walkthrough (dev)

```sh
npm run dev
```

Open any markdown file.

1. **US1 — highlight**: Type a misspelled word (e.g. `teh`). A red squiggly
   underline appears under it shortly after typing stops.
2. **US2 — right-click correction**: Right-click the underlined word. A native
   context menu lists corrections (e.g. `the`). Click one — the word is replaced
   in place and the caret sits after it. Right-click a correctly spelled word —
   no spelling suggestions appear.
3. **US3 — add to dictionary**: Right-click a valid-but-flagged word (e.g. a
   name), choose **Add "…" to Dictionary**. The word is no longer underlined in
   any open document; quit and relaunch the app and it is still not flagged.
4. **US4 — toggle**: Open Settings → untick **Check spelling while typing**.
   Every underline disappears immediately. Tick it back on — words you now type
   are underlined again (already-rendered words re-mark as you edit them, the
   accepted native behaviour). Quit and relaunch — the choice is remembered.

## Expected outcomes

- Misspelled words are underlined with no user action (SC-001).
- Right-clicking a misspelled word always offers corrections for common
  misspellings (SC-002) and a click applies the correction immediately (SC-003).
- Learned words stop being flagged in-session and across restarts (SC-004,
  FR-005).
- The toggle flips highlighting on/off instantly and persists (US4).
