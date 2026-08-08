# Feature Specification: Dictionary Coverage

**Feature Branch**: `phase-025-dictionary-upgrade`

**Created**: 2026-08-08

**Status**: Archived

**Input**: User report: "The default dictionary for the app seems to be missing many words, e.g. Lacanian, Kleinian, Psychodynamic, reproduceable, JSON, hominem, Experimentations, maladaptive."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Commonly Used Words Are Not Flagged (Priority: P1)

A user writes everyday academic/technical prose and ordinary words that the
spellchecker currently flags as misspelled (e.g. "maladaptive") are no longer
underlined, because the bundled dictionary is larger.

**Why this priority**: This is the core value of the change. False positives
teach users to ignore the underlines, which destroys the feature's value.

**Independent Test**: Open a document containing the word "maladaptive" in the
WYSIWYG editor and confirm no red squiggly underline appears beneath it.

**Acceptance Scenarios**:

1. **Given** spellcheck is enabled and the editor shows "maladaptive", **When** the whole document is checked, **Then** "maladaptive" is not flagged.
2. **Given** spellcheck is enabled, **When** a common word previously missing from the dictionary is typed, **Then** it is not flagged.
3. **Given** the dictionaries are upgraded, **When** the existing language tests (British vs American spellings) run, **Then** the British/American behaviour is unchanged (no regression).

---

### User Story 2 - Domain and Technical Terms Are Accepted (Priority: P1)

A user writing about psychology, computing, or academic topics finds that
correctly spelled domain words (e.g. "JSON", "Lacanian", "Kleinian",
"hominem") are no longer flagged, even though no general English dictionary
contains them, because the app ships a curated supplemental word list.

**Why this priority**: The report names these words specifically. A
supplemental list exists precisely because no reasonable general dictionary
covers every technical and proper-noun-derived term.

**Independent Test**: Open a document containing "JSON" and "Lacanian" and
confirm neither is underlined.

**Acceptance Scenarios**:

1. **Given** spellcheck is enabled, **When** the document contains "JSON", **Then** it is not flagged.
2. **Given** spellcheck is enabled, **When** the document contains "Lacanian", **Then** it is not flagged.
3. **Given** spellcheck is enabled, **When** the document contains "hominem", **Then** it is not flagged.
4. **Given** the supplemental list is active, **When** a word in it appears in any document, **Then** it is not flagged in either en-GB or en-US.

---

### Edge Cases

- A supplemental word that is genuinely misspelled by the user (e.g. a list
  entry that is a nonstandard spelling such as "reproduceable"): the list is
  curated, so its contents are trusted as user-requested terms; a listed word
  is never flagged.
- A word in both the dictionary and the supplemental list: the dictionary
  already accepts it; the list entry is redundant and harmless.
- Case: "JSON" (all caps) vs "json": the checker lowercases before checking the
  supplemental list, so both forms are accepted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The bundled en-GB and en-US dictionaries MUST be larger than the
  current sets, covering substantially more common words, with no regression in
  the existing British/American distinction.
- **FR-002**: The app MUST ship a curated supplemental word list of domain,
  technical, and proper-noun-derived terms that general dictionaries do not
  cover, and the WYSIWYG checker MUST treat those words as valid in both en-GB
  and en-US.
- **FR-003**: The supplemental list MUST apply at whole-document check time —
  listed words already present when a file opens are not flagged.
- **FR-004**: The change MUST NOT alter the correction menu, the add-to-dictionary
  flow, the settings toggle, or the language selector.
- **FR-005**: The dictionaries and supplemental list MUST remain bundled assets —
  offline, no download, no new IPC, no change to the renderer's sandbox.

### Key Entities

- **Supplemental word list**: a curated, app-owned set of words accepted by the
  WYSIWYG checker on top of the bundled dictionaries. Distinct from the user's
  personal dictionary (which the user grows); the supplemental list ships with
  the app and is never written to the user's config.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The words named in the report (Lacanian, Kleinian, Psychodynamic,
  reproduceable, JSON, hominem, Experimentations, maladaptive) are not flagged
  by the WYSIWYG checker in either en-GB or en-US.
- **SC-002**: The existing spellcheck unit and e2e suites pass unchanged (the
  British/American tests still flag the opposite dialect's spellings, and the
  misspelling/typo tests still flag real errors).
- **SC-003**: No perceptible typing-latency regression from the larger
  dictionaries (consistent with Principle IV).
- **SC-004**: The bundled dictionaries are at least 50% larger by word count
  than the current sets.

## Clarifications

- **2026-08-08** — User decision: upgrade the bundled dictionaries to the larger
  SCOWL/ESDB size-70 sets (en-US and en-GB) AND add a curated supplemental word
  list. Rationale: the size-70 dictionaries fix the common-word gaps (e.g.
  "maladaptive"), but even they do not contain the domain words the report names
  (verified against the actual files — "JSON", "Lacanian", "Kleinian",
  "hominem", "psychodynamic" are absent from size-70 too); those need the
  supplemental list.
- **2026-08-08** — The supplemental list's initial contents are the words named
  in the report plus a small curated set of common technical/academic terms. The
  list is a bundled asset; extending it is a one-file change. "reproduceable"
  (a nonstandard variant of "reproducible") and "hominem" (Latin, from "ad
  hominem") are included because the report names them; a curated list is
  explicitly the mechanism for terms no general dictionary has.

## Assumptions

- The dictionaries remain open-source Hunspell sets licensed for bundling and
  redistribution (SCOWL/ESDB, permissive — attribution retained in the repo).
- The supplemental list lives in the renderer's bundled assets, keyed by
  language like the dictionaries but shared across en-GB and en-US (its terms
  are dialect-neutral).
- The personal dictionary and the settings surface are unchanged.
- The source-view textarea keeps the platform native spellchecker (its coverage
  is OS-provided and out of scope).
