# Feature Specification: Editor Spellcheck

**Feature Branch**: `phase-020-editor-spellcheck`

**Created**: 2026-08-06

**Status**: Archived

**Input**: User description: "Enable spellcheck in the WYSIWYG editor so that misspelled words are highlighted and can be corrected via right-click context menu."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Misspelled Words Are Highlighted (Priority: P1)

A user types in the WYSIWYG editor and misspelled words are automatically underlined with a red squiggly line, making them easy to spot while writing. The highlighting happens without any user action beyond typing.

**Why this priority**: This is the core value of the feature. Without visual highlighting, the user has no signal that a word is misspelled and no reason to invoke the correction workflow.

**Independent Test**: Open a document in the WYSIWYG editor and type a misspelled word (e.g., "teh" instead of "the"). A red squiggly underline appears beneath the misspelled word within a reasonable time after typing stops.

**Acceptance Scenarios**:

1. **Given** spellcheck is enabled and the editor is focused, **When** the user types a misspelled word and pauses briefly, **Then** a red squiggly underline appears beneath the misspelled word.
2. **Given** a misspelled word is highlighted, **When** the user corrects the word to a valid spelling, **Then** the red squiggly underline disappears.
3. **Given** the editor contains multiple misspelled words, **When** the user views the document, **Then** all misspelled words are individually underlined.
4. **Given** spellcheck is enabled, **When** the user types inside a code block, **Then** spellcheck behaviour follows the platform's native handling of code regions.

---

### User Story 2 - Right-Click Correction of Misspelled Words (Priority: P1)

A user right-clicks on a misspelled word and sees a context menu with suggested corrections. Clicking a suggestion replaces the misspelled word with the chosen correction.

**Why this priority**: This is the primary correction workflow. Without it, the user can see that a word is wrong but has no efficient way to fix it in place.

**Independent Test**: Type a misspelled word (e.g., "recieve") in the editor, right-click on it, and observe that a context menu appears with spelling suggestions. Click a suggestion and verify the word is replaced.

**Acceptance Scenarios**:

1. **Given** a misspelled word is highlighted in the editor, **When** the user right-clicks on the word, **Then** a context menu appears showing one or more spelling suggestions for that word.
2. **Given** the spelling suggestions context menu is open, **When** the user clicks a suggestion, **Then** the misspelled word is replaced with the selected suggestion and the cursor is placed after the corrected word.
3. **Given** the spelling suggestions context menu is open, **When** the user clicks outside the menu or presses Escape, **Then** the menu closes without changing the word.
4. **Given** a correctly spelled word is in the editor, **When** the user right-clicks on it, **Then** the context menu does not show spelling suggestions (but may show other editing options).

---

### User Story 3 - Add Unknown Words to Dictionary (Priority: P2)

A user encounters a correctly spelled but domain-specific or personal word (e.g., a name, technical term, or neologism) that the spellchecker flags as misspelled. The user adds this word to their personal dictionary so it is no longer flagged.

**Why this priority**: Important for writers who use specialised vocabulary. Without this, the persistent false positives become noise that the user learns to ignore, undermining the feature's value.

**Independent Test**: Type a valid but uncommon word that is flagged as misspelled, right-click it, and add it to the dictionary. Verify the word is no longer flagged in the current session and after restarting the application.

**Acceptance Scenarios**:

1. **Given** a word is flagged as misspelled, **When** the user right-clicks the word and selects "Add to dictionary", **Then** the word is no longer highlighted as misspelled.
2. **Given** a word has been added to the dictionary, **When** the application is restarted, **Then** the word is still not flagged as misspelled.
3. **Given** a word has been added to the dictionary, **When** the same word appears in a different document opened in the same session, **Then** it is not flagged as misspelled.

---

### User Story 4 - Toggle Spellcheck On and Off (Priority: P3)

A user who does not want spellcheck (or finds it distracting) can disable it through the application settings. Re-enabling it restores the highlighting behaviour.

**Why this priority**: Spellcheck is a convenience feature, not a core editing function. Some users may prefer to work without it. It should be toggleable but defaults to on.

**Independent Test**: Open settings, toggle spellcheck off, and verify that red squiggly underlines disappear from misspelled words. Toggle it back on and verify they reappear.

**Acceptance Scenarios**:

1. **Given** spellcheck is enabled (the default), **When** the user disables it in settings, **Then** all red squiggly underlines disappear from the editor immediately.
2. **Given** spellcheck is disabled, **When** the user re-enables it in settings, **Then** misspelled words are highlighted again.
3. **Given** the user changes the spellcheck setting, **When** the application is restarted, **Then** the setting persists at its last chosen value.

---

### Edge Cases

- What happens when the editor is empty? No spellcheck errors should appear.
- What happens when a document contains a mix of natural language and code blocks? The platform's native spellchecker handles code regions according to its own behaviour; typically code blocks are not spellchecked because they are rendered as non-editable regions.
- What happens when the user right-clicks on a word that spans the boundary of formatted text (e.g., partially bold)? The entire word is treated as one unit for spellcheck purposes.
- What happens when no dictionary is available (e.g., first launch, no network for dictionary download)? The editor works normally without spellcheck highlighting; no error is shown to the user.
- What happens when the user right-clicks in the source view? The platform's native spellcheck context menu appears, providing the same correction workflow as in the WYSIWYG editor.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST highlight misspelled words with a red squiggly underline in the WYSIWYG editor when spellcheck is enabled.
- **FR-002**: The system MUST display spelling suggestions in a context menu when the user right-clicks a misspelled word in the editor.
- **FR-003**: The system MUST replace the misspelled word with the user-selected suggestion when a correction is chosen from the context menu.
- **FR-004**: The system MUST allow the user to add a word to their personal dictionary so it is no longer flagged as misspelled.
- **FR-005**: The system MUST persist the personal dictionary across application restarts.
- **FR-006**: The system MUST provide a setting to enable or disable spellcheck, defaulting to enabled.
- **FR-007**: The system MUST spellcheck the WYSIWYG editor against the document's full content — misspellings already present when a file is opened are flagged, and new ones are flagged as they are typed (whole-document checking, 2026-08-07).
- **FR-008**: The system MUST provide a correction menu when the user right-clicks a misspelled word in the WYSIWYG editor (the app's own menu, built from the checker's suggestions) and MUST NOT be blocked by any platform right-click handling in the editor area.
- **FR-009**: The spellcheck setting MUST persist across application restarts.
- **FR-010**: The system MUST NOT introduce perceptible typing latency from spellcheck processing (consistent with Principle IV, Calm Predictable Editing).

### Key Entities

- **Personal Dictionary**: A user-maintained collection of words that the spellchecker treats as valid. Persisted across sessions and shared across all open documents.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A misspelled word is visually highlighted within 2 seconds of the user pausing typing.
- **SC-002**: Right-clicking a misspelled word shows at least one correction suggestion 100% of the time for common misspellings.
- **SC-003**: Selecting a correction from the context menu replaces the word and dismisses the menu within 200 milliseconds.
- **SC-004**: 95% of users can identify and correct a misspelled word within 5 seconds of it being highlighted.
- **SC-005**: No perceptible typing latency degradation when spellcheck is active compared to when it is disabled.

## Clarifications

- **2026-08-07** — Whole-document checking replaces the earlier native-engine scope (user decision): the WYSIWYG editor is checked by a **JS spellchecker in the renderer** (`nspell` + bundled en-GB/en-US Hunspell dictionaries checked in under `src/renderer/assets/dictionaries/`). The whole document is checked on open and re-checked (debounced ~120 ms) after each edit; misspelled ranges get the `ame-spelling-error` wavy-red underline decoration. The earlier limitation — that the platform native spellchecker only scans typed/edited text — no longer applies to the WYSIWYG editor; the earlier "check as you type / native" clarifications are superseded by this one.
- **2026-08-07** — Re-enable behaviour (US4 S2): because the WYSIWYG checker is the app's own, disabling spellcheck clears every underline immediately and re-enabling re-runs the whole-document pass — there is no deferred re-marking. (The source view still uses the platform native spellchecker, where the native re-enable behaviour applies.)
- **2026-08-07** — Spellcheck language is selectable: the Settings dialog offers System default / English (UK) / English (US), persisted as `spellcheckLanguage` (`null` = system default, resolved from the platform language). The WYSIWYG checker loads the matching bundled dictionary; the source view's native spellchecker gets the same language via the session. Additional languages can be added by extending the closed union + bundling a dictionary.

## Assumptions

- The WYSIWYG spellchecker is a JS engine (`nspell`) running in the renderer, with the en-GB and en-US Hunspell dictionaries bundled as assets (no network, no download, works offline). Dictionary files are from the open-source `dictionaries` project (MIT).
- The source view keeps the platform's native spellchecker (it is a plain textarea where native checking works well); its language is set from the same `spellcheckLanguage` setting via the session.
- The WYSIWYG correction menu is the app's own DOM menu (suggestions come from the checker), not a platform native menu.
- Markdown code blocks and math are not spellchecked (spec edge case).
- Spellcheck language selection defaults to the platform's default language; the user can explicitly choose System default / English (UK) / English (US) in Settings. Additional languages can be added by extending the closed union and bundling a dictionary.
