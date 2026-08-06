# Feature Specification: Editor Spellcheck

**Feature Branch**: `phase-020-editor-spellcheck`

**Created**: 2026-08-06

**Status**: Draft

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
- **FR-007**: The system MUST allow the platform's native spellchecker to operate in both the WYSIWYG editor and the source view.
- **FR-008**: The system MUST NOT suppress the platform's native right-click context menu in the editor area; spelling suggestions must be accessible when right-clicking a misspelled word.
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

## Assumptions

- The built-in spellchecker uses the platform's native spellchecking engine, which is available by default in the desktop shell and requires no additional dependencies.
- Spellcheck dictionaries for the user's primary language are available or can be downloaded automatically by the platform.
- The right-click context menu for spelling corrections will use the platform's native context menu for the editor area.
- Spellcheck language selection is limited to the platform's default language for the initial implementation; multi-language support can be added later.
- The source view enables native spellcheck. Markdown syntax characters (e.g., `#`, `**`, `[]`) may occasionally be flagged by the platform spellchecker; this is accepted as a minor trade-off of using native behaviour everywhere.
