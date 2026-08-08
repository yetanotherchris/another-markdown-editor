# Contract: Dictionary Coverage

**Feature**: 025-dictionary-coverage | **Date**: 2026-08-08

## Scope

Deltas to the spec 020 spellcheck contract. The IPC surface, settings fields,
personal-dictionary channels, correction menu, and source-view native
spellchecker are all UNCHANGED.

## Pure renderer contract — `src/renderer/domain/spellcheck.ts`

Signature unchanged:

```ts
export function findMisspellings(text: string, checker: NSpell, customWords: ReadonlySet<string>): Misspelling[]
```

New internal behaviour:

- The module imports `supplemental-words.txt` (`?raw`) and exposes
  `SUPPLEMENTAL_WORDS: ReadonlySet<string>` (lowercased).
- `findMisspellings` skips any token whose lowercase form is in
  `SUPPLEMENTAL_WORDS`, in addition to the existing `customWords` skip. The
  skip applies identically for en-GB and en-US (the set is dialect-neutral).

## Bundled assets

| File | Content |
|------|---------|
| `src/renderer/assets/dictionaries/en-gb.aff` / `.dic` | en_GB-large, SCOWL/ESDB size 70, 2026.02.25 (permissive license, attribution in folder README) |
| `src/renderer/assets/dictionaries/en-us.aff` / `.dic` | en_US-large, SCOWL/ESDB size 70, 2026.02.25 |
| `src/renderer/assets/dictionaries/supplemental-words.txt` | Curated list, one lowercase word per line |
| `src/renderer/assets/dictionaries/README.md` | Provenance + license terms for all bundled dict assets |

## Behaviour contract (regression guard)

- British/American split unchanged: en-GB accepts `behaviour`/`colour`/
  `recognise`/`organisation` and flags `color`; en-US accepts `color`/
  `recognize`/`organization` and flags `behaviour`.
- Typo detection unchanged: `teh`, `recieve`, `definately`, `knwon` remain
  flagged in both languages.
- Supplemental words (`JSON`, `Lacanian`, `Kleinian`, `psychodynamic`,
  `hominem`, `reproduceable`, `experimentations`, `maladaptive`) are never
  flagged in either language.
- The user's `customWords` still take precedence and are unchanged.

## Acceptance contract

Verified in `tests/renderer/spellcheck.test.ts` (new supplemental block) plus
the unchanged `tests/e2e/spellcheck.spec.ts`:

- US1 (report words not flagged): unit assertions that each named word yields
  no misspelling in both en-GB and en-US.
- US2 (no regression): the existing unit + e2e suites pass unchanged.
