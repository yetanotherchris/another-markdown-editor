# Implementation Plan: Dictionary Coverage

**Branch**: `phase-025-dictionary-upgrade` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-dictionary-coverage/spec.md`

## Summary

The WYSIWYG spellchecker's bundled dictionaries are replaced with the larger
SCOWL/ESDB **size-70** en-US and en-GB Hunspell sets (the `-large` variants,
2026.02.25 release, ~77–78k words each vs the current ~49.5k). A **curated
supplemental word list** (a bundled asset) adds the domain/technical terms the
report names — none of which the size-70 dictionaries contain — and the checker
accepts listed words in both languages. No IPC, no settings, no personal
dictionary, no sandbox change: the whole change stays in the renderer's bundled
assets + the pure `spellcheck.ts` domain module.

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true (renderer project).

**Primary Dependencies**: `nspell` (unchanged); the dictionary assets swapped
in-place (same filenames, larger content). The supplemental list is a bundled
`?raw` text asset or a TS constant (see Phase 1 decision).

**Storage**: unchanged — the supplemental list is a bundled asset, never
written to the user's config.

**Testing**: Vitest 4 (tests/renderer jsdom) for the pure checker; Playwright
e2e (unchanged suite) must still pass — it is the regression guard that the
British/American distinction and typo detection survive the swap.

**Target Platform**: Windows, macOS, Linux desktop (renderer assets only).

**Constraints**: Renderer sandboxed (no Node/fs); dictionaries and the
supplemental list must remain bundled; no new IPC channel; the correction menu,
personal dictionary, settings toggle, and language selector are untouched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | No new IPC, no preload change, no renderer access beyond bundled assets it already owns | **PASS** |
| II. Every Path Is Untrusted | No paths touched; bundled assets only | **PASS** |
| III. Never Lose The User's Words | No save/dirty path altered; personal dictionary untouched | **PASS** |
| IV. Calm, Predictable Editing | Dictionaries are compiled once at module load; nothing on the keystroke path; larger sets only shift one-time parse cost | **PASS** |
| V. Test What Can Corrupt Or Escape | The checker swap is covered by the existing unit + e2e suites; new supplemental words get explicit unit coverage | **PASS** |

**Post-design re-check**: no principle is violated.

## Phase 1 Design decisions

**Dictionaries: swap in-place, keep filenames.** The four files
(`en-gb.aff/.dic`, `en-us.aff/.dic`) are replaced with the en-GB-large / en-US-large
files from the SCOWL/ESDB 2026.02.25 hunspell release (permissive license,
attribution retained via a README in the dictionaries folder). Filenames stay
the same so `spellcheck.ts` imports and the bundler config are unchanged.
**Verified** against the real files with `nspell`: the existing British/American
unit tests' expectations hold (GB accepts behaviour/colour/recognise/organisation
and flags color; US accepts color/recognize/organization and flags behaviour),
all misspelling/typo fixtures still flag, and "maladaptive" is now accepted.

**Supplemental list: a bundled `?raw` text asset.** A `supplemental-words.txt`
file in `src/renderer/assets/dictionaries/`, imported `?raw`, parsed into a
lowercased `ReadonlySet<string>` in `spellcheck.ts`. `findMisspellings` skips
any word present in the set (in addition to the user's `customWords`), so
listed words are valid in both languages with no per-language branching. The
list is dialect-neutral and curated.

**Supplemental list contents** (spec Clarification 2026-08-08): the words named
in the report that no dictionary contains — JSON, Lacanian, Kleinian,
psychodynamic, hominem, reproduceable, experimentations — plus a small curated
set of common technical/academic terms (final contents decided in
implementation; any word already covered by the size-70 dictionaries is
redundant and may be omitted).

**No e2e change required by the swap.** The existing e2e suite is the
regression gate: US1/US3 rely on `teh`/`recieve`/`definately`/`zqwlux` still
being flagged (verified), US4 relies on the language switch still flipping
colour/color (verified). A new unit-test block covers the supplemental words.

## Project Structure

### Documentation (this feature)

```text
specs/025-dictionary-coverage/
├── spec.md              # Requirements (with 2026-08-08 clarifications)
├── plan.md              # This file
├── research.md          # R1…Rn decisions (all empirically verified)
├── data-model.md        # Supplemental list entity (bundled, not persisted)
├── quickstart.md        # Manual verification script
├── contracts/
│   └── spellcheck.md    # Behaviour contract deltas vs spec 020
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/renderer/
├── assets/dictionaries/
│   ├── en-gb.aff              # REPLACED: en-GB-large (SCOWL/ESDB size 70, 2026.02.25)
│   ├── en-gb.dic              # REPLACED
│   ├── en-us.aff              # REPLACED: en-US-large (SCOWL/ESDB size 70, 2026.02.25)
│   ├── en-us.dic              # REPLACED
│   ├── supplemental-words.txt # NEW: curated list (one word per line, lowercase)
│   └── README.md              # NEW: provenance + license for all bundled dict assets
├── domain/
│   └── spellcheck.ts          # + supplemental-words.txt `?raw` import + skip in findMisspellings
└── types.d.ts                 # unchanged (`*?raw` already declared)

tests/renderer/
└── spellcheck.test.ts         # + supplemental-word acceptance block (both languages)
```

## Phase status

- Phase 1: Setup — branch, asset swap, supplemental list asset + README
- Phase 2: Implementation — `spellcheck.ts` import + skip logic
- Phase 3: Verification — unit + typecheck + lint + e2e
- Phase 4: Polish — spec archive, PR

## Deferred / later features

- A management UI for the supplemental list (out of scope; it is a bundled
  asset by design — editing it is a source change, not a user feature).
- Additional languages: the size-70 upgrade is English-only, matching the
  existing en-GB/en-US union.

## Complexity tracking

No constitution violations. The change is confined to bundled assets and a
pure renderer function; the supplemental list is small and curated, so the
"never flag a listed word" rule cannot corrupt or escape user data.
