# Quickstart: Dictionary Coverage

**Feature**: 025-dictionary-coverage

## Manual verification

1. `npm install` then `npm run dev`.
2. Create a document containing: `maladaptive JSON Lacanian Kleinian psychodynamic hominem reproduceable experimentations`
3. Open it in the WYSIWYG editor. None of those words should have a red squiggly
   underline in either the default language or after switching the spellcheck
   language between English (UK) and English (US) in Settings.
4. Type a real typo (`teh`) next to them — it must still be underlined.
5. Switch the language en-GB ↔ en-US and confirm `behaviour`/`colour` vs
   `behavior`/`color` still flip (British/American split unchanged).

## Automated verification

```text
npm run test        # unit — incl. the new supplemental-word block
npm run test:e2e    # build + Playwright — existing spellcheck suite unchanged
npm run lint
npm run typecheck
npm run check
```
