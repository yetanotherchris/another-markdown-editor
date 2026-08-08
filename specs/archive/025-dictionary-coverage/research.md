# Research: Dictionary Coverage

**Feature**: 025-dictionary-coverage | **Date**: 2026-08-08

Decisions are recorded R1…Rn in the order they were made. Every decision here
was **verified empirically** against the actual files before the plan was
written (AGENTS.md: verify before asserting) — the candidate dictionaries were
downloaded, parsed with `nspell`, and checked word by word.

## R1 — The bundled dictionaries are the size-60 SCOWL/ESDB sets (~49.5k words)

**Decision**: Confirmed the current bundled files are the standard (size-60)
en-US / en-GB hunspell dictionaries from the `dictionaries`/SCOWL lineage: both
`.dic` files hold ~49,500 entries.

**Verified**: `en-us.dic` = 49,524 lines, `en-gb.dic` = 49,601 lines. The
report's words were checked against the built checker: `Lacanian`, `Kleinian`,
`Psychodynamic`, `reproduceable`, `JSON`, `hominem`, `Experimentations`,
`maladaptive` are ALL flagged by the current bundled dictionaries.

## R2 — The larger size-70 (`-large`) dictionaries exist and are MIT/BSD-compatible

**Decision**: Use the SCOWL/ESDB **size-70** hunspell dictionaries
(`en_US-large`, `en_GB-large`) from the ESDB 2026.02.25 release
(https://wordlist.aspell.net/dicts/), which is the same lineage as the current
dictionaries but ~60% larger.

**Verified**: Downloaded `hunspell-en_US-large-2026.02.25.zip` (en_US-large.dic
= 76,960 entries) and `hunspell-en_GB-large-2026.02.25.zip` (en_GB-large.dic =
78,000 entries). License read from the bundled README: SCOWL's permissive
terms — "Permission to use, copy, modify, distribute, and sell any part of
SCOWLv2, or word lists created from it, is hereby granted without fee, provided
that the above copyright notice appears in all copies…". The affix file carries
the Geoff Kuenning BSD license. Both permit bundling with attribution.

**Alternatives considered**:
- `@cspell/dict-en_us` (MIT, ~large). Rejected: ships a compressed trie, not
  hunspell `.aff`/`.dic` — nspell cannot consume it directly.
- `dictionary-en` (wooorm, MIT). Rejected: 49,569 entries — essentially the
  SAME size as what is already bundled; swapping gives no coverage gain.

## R3 — Size-70 fixes the common-word gaps but NOT the domain words

**Decision**: The size-70 dictionaries fix words like `maladaptive`, but the
report's domain/technical words are absent even from size-70, so a supplemental
list is required on top (spec Clarification 2026-08-08, user decision:
"Upgrade + supplemental list").

**Verified** with `nspell` against en_US-large / en_GB-large:

| word | en-US large | en-GB large |
|------|-------------|-------------|
| maladaptive | OK | OK |
| reproducible | OK | OK |
| Lacanian | MISS | MISS |
| Kleinian | MISS | MISS |
| psychodynamic | MISS | MISS |
| reproduceable | MISS | MISS |
| JSON | MISS | MISS |
| hominem | MISS | MISS |
| experimentations | MISS | MISS |

The `dictionary-en` package from the same project yields identical misses
(verified) — there is no off-the-shelf drop-in that covers the domain words.

## R4 — The dictionary swap causes no regression in the existing test fixtures

**Decision**: Keep the swap safe by verifying every word the current test suite
depends on, before writing the plan.

**Verified** with `nspell` against both size-70 dictionaries:

- British/American split (spec 020 tests): GB accepts `behaviour`, `colour`,
  `recognise`, `organisation` and flags `color`; US accepts `color`,
  `recognize`, `organization` and flags `behaviour`. Unchanged.
- Typo fixtures: `teh`, `recieve`, `definately`, `knwon`, `zqwlux` all still
  MISS in both. Unchanged.
- Clean-word fixtures: `clean`, `quick`, `brown`, `fox`, `jumps`, `over`,
  `lazy`, `dog`, `don't`, `it's`, `cant` all still OK. Unchanged.

## R5 — Supplemental list mechanics: bundled `?raw` asset, lowercased skip-set

**Decision**: The supplemental list is a bundled text asset
(`supplemental-words.txt`) imported `?raw` (the `*?raw` module declaration
already exists in `src/renderer/types.d.ts`), parsed to a lowercased
`ReadonlySet<string>` in `spellcheck.ts`. `findMisspellings` skips any word in
that set exactly as it skips the user's `customWords` (the check already
lowercases via `word.toLowerCase()`), so listed words are valid in both
languages with no per-language branching.

**Rationale**: matches the existing pattern for the dictionary assets (bundled,
`?raw`), keeps the checker pure and unit-testable, and requires no IPC, no
settings field, and no sandbox change (Principle I). The set is shared across
en-GB and en-US because its terms are dialect-neutral.

**Alternatives considered**:
- A TS constant in `spellcheck.ts`. Rejected: a text asset keeps the list
  editable without touching code and mirrors the other dictionary assets.
- A new IPC channel / settings field. Rejected: the list is app-owned and
  bundled; nothing user-facing needs to change it at runtime.

**Case handling**: `findMisspellings` checks `customWords.has(word.toLowerCase())`
already; the supplemental set is consulted the same way, so `JSON`, `Json`, and
`json` are all accepted.
