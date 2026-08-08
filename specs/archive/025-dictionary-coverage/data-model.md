# Data Model: Dictionary Coverage

**Feature**: 025-dictionary-coverage | **Date**: 2026-08-08

## Entities

### Supplemental word list (spec: Key Entities)

The app-owned set of words the WYSIWYG checker accepts on top of the bundled
dictionaries. Distinct from the user's personal dictionary: the supplemental
list ships with the app and is never written to the user's config.

| Aspect | Value |
|--------|-------|
| Where it lives | A bundled asset, `src/renderer/assets/dictionaries/supplemental-words.txt` (one lowercase word per line). |
| How it loads | Imported `?raw` into `src/renderer/domain/spellcheck.ts` and parsed into a lowercased `ReadonlySet<string>`. |
| Owner | The renderer's pure checker (spec 020 architecture). No main-process involvement, no IPC. |
| Lifecycle | Static — a source asset. Extending it is a one-file edit + rebuild. |
| Format | Lowercased words, deduplicated, one per line. |

### Bundled dictionaries (existing entity, upgraded content)

| File | Previous | Now |
|------|----------|-----|
| `en-gb.aff` / `en-gb.dic` | size-60 en-GB, ~49.6k entries | en_GB-large (SCOWL/ESDB size 70, 2026.02.25), ~78k entries |
| `en-us.aff` / `en-us.dic` | size-60 en-US, ~49.5k entries | en_US-large (SCOWL/ESDB size 70, 2026.02.25), ~77k entries |

Filenames are unchanged so `spellcheck.ts` imports and the bundler config are
untouched. A `README.md` in the dictionaries folder records provenance and the
permissive SCOWL/ESDB + BSD-affix license terms (attribution, as the license
requires).

## Relationship to existing entities

| Entity | Effect |
|--------|--------|
| Settings (`spellcheckEnabled`, `spellcheckLanguage`) | Unchanged — no new fields, no validation/merge/migration changes. |
| Personal Dictionary (`spellcheckDictionary` in config) | Unchanged — user-grown, still persisted via `spellcheck:getWords`/`spellcheck:addWord`, still takes precedence. |
| Spellcheck runtime (`spellcheckRuntime.ts`) | Unchanged — still reads `enabled`/`language`/`customWords`; the supplemental list is consulted inside `findMisspellings`, invisible to the runtime. |

## Checker skip-order (in `findMisspellings`)

For each token: skip ordinal-suffix tokens → skip if in the user's
`customWords` → skip if in the supplemental list → else flag if the checker
rejects it. The supplemental list is consulted identically in en-GB and en-US.
