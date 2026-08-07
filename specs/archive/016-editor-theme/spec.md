# Feature Specification: Editor Theme

**Feature Branch**: `[016-editor-theme]`

**Created**: 2026-08-06

**Status**: Archived

**Input**: User description: "A spec for the editor theme, which is configurable in the settings window. It will store the theme name in the configuration file, the theme values will live in the code. Five editor themes: Rustic, Rustic Serif, Monotone, Monotone Serif, Scholarly. Selecting one of these themes and pressing 'save' in the settings changes the editor theme."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose an Editor Theme in Settings (Priority: P1)

A user can open the settings window, pick one of the five named editor themes, and press Save to change the appearance of the formatted editor canvas immediately — without restarting the application.

**Why this priority**: The whole point of the feature is letting the user switch the editing surface's look from settings; nothing else is useful if this flow does not work.

**Independent Test**: Open settings, select a theme that is not currently active, press Save, and verify the formatted editor canvas changes to that theme within 5 seconds.

**Acceptance Scenarios**:

1. **Given** the settings window is open, **When** the user views the settings, **Then** an editor theme control lists all five themes: Rustic, Rustic Serif, Monotone, Monotone Serif, and Scholarly.
2. **Given** the user selects a theme in the settings window, **When** they press Save, **Then** the formatted editor canvas is re-rendered in the selected theme without requiring an application restart.
3. **Given** the user selects a theme in the settings window, **When** they press Save, **Then** the choice is recorded in the configuration file.
4. **Given** the settings window is open, **When** the user closes it without pressing Save, **Then** the editor theme does not change.

---

### User Story 2 - Persist the Editor Theme (Priority: P1)

A user's chosen editor theme is remembered across application restarts, so the editor always opens in their preferred look.

**Why this priority**: A theme that resets on restart is not a real setting; persistence is required for trust.

**Independent Test**: Change the editor theme, close the application, reopen it, and verify the editor canvas uses the saved theme.

**Acceptance Scenarios**:

1. **Given** the user has saved a non-default editor theme, **When** they close and reopen the application, **Then** the editor canvas renders in that theme.
2. **Given** the configuration file is missing or malformed, **When** the application starts, **Then** the editor uses the default theme (Rustic) and the application remains fully usable.

---

### User Story 3 - The Rustic Theme Matches the Current Canvas (Priority: P1)

The Rustic theme is the default and reproduces the current WYSIWYG editing surface: a warm off-white canvas, a modern sans-serif body typeface, and monospace inline code.

**Why this priority**: Rustic defines the baseline that every other theme is compared against and is the safe default when no choice is saved.

**Independent Test**: With the default settings, verify the formatted editor canvas shows a warm off-white background and a sans-serif body typeface with monospace inline code.

**Acceptance Scenarios**:

1. **Given** no editor theme has been saved, **When** the user edits a document in the formatted view, **Then** the canvas uses the Rustic theme.
2. **Given** the Rustic theme is active, **When** the user views a document, **Then** the canvas background is the warm off-white `#fffdfb`.
3. **Given** the Rustic theme is active, **When** the user views body text, **Then** it renders in a modern sans-serif typeface at the base reading size, with headings in the same family at progressively larger fixed sizes.
4. **Given** the Rustic theme is active, **When** the user views inline code, **Then** it renders in a monospace typeface.

---

### User Story 4 - Use a Serif Variant (Priority: P1)

The Rustic Serif and Monotone Serif themes keep everything about their non-serif counterparts except the typeface: body text and headings render in a serif face.

**Why this priority**: Serif variants are two of the five requested themes; they must differ from the sans versions only in typeface, or users will not be able to tell them apart from the originals.

**Independent Test**: Switch from Rustic to Rustic Serif and verify the same warm off-white canvas now renders body text and headings in a serif face.

**Acceptance Scenarios**:

1. **Given** the Rustic Serif theme is active, **When** the user views body text and headings, **Then** both render in a serif typeface, and the canvas background remains `#fffdfb`.
2. **Given** the Monotone Serif theme is active, **When** the user views body text and headings, **Then** both render in a serif typeface, and the colors still follow the resolved app theme exactly as the Monotone theme does.

---

### User Story 5 - Use a Monochrome Theme that Follows the App Theme (Priority: P1)

The Monotone theme renders the editor canvas in a strict two-tone scheme that matches the application's resolved appearance: black text on white in a light theme, white text on black in a dark theme, and it follows the operating system live when the app is in system mode.

**Why this priority**: Monotone is the requested way to tie the editor canvas to the application's overall light/dark appearance, including live OS changes.

**Independent Test**: Set the app theme to dark, select the Monotone theme, and verify the canvas shows white text on a black background; then set the app theme back to light and verify black text on white.

**Acceptance Scenarios**:

1. **Given** the app is in light mode and the Monotone theme is active, **When** the user views the canvas, **Then** text renders black on a white background.
2. **Given** the app is in dark mode and the Monotone theme is active, **When** the user views the canvas, **Then** text renders white on a black background.
3. **Given** the app is set to system mode, the OS switches between light and dark while the application is running, and a Monotone theme is active, **When** the OS change completes, **Then** the canvas updates to the matching two-tone scheme within 5 seconds.
4. **Given** the OS does not report a theme preference and the app is in system mode, **When** a Monotone theme is active, **Then** the canvas falls back to the light scheme (black on white).

---

### User Story 6 - Use the Scholarly Theme (Priority: P2)

The Scholarly theme renders the editor canvas with a clean white background, a distinct Helvetica-like sans-serif body typeface, and headings in the accent blue `#00B0E9`.

**Why this priority**: Scholarly is the fifth requested theme and the only one with colored headings; it must look clearly different from the warm Rustic canvas.

**Independent Test**: Select the Scholarly theme, press Save, and verify the canvas shows a white background, blue headings, and a Helvetica-like sans-serif body.

**Acceptance Scenarios**:

1. **Given** the Scholarly theme is active, **When** the user views the canvas, **Then** the background is white and headings render in `#00B0E9` (RGB 0,176,233).
2. **Given** the Scholarly theme is active, **When** the user views body text, **Then** it renders in a distinct Helvetica-like sans-serif typeface that differs from the Rustic family (clarification 2026-08-06).
3. **Given** the Scholarly theme is active, **When** the user views inline code, **Then** it renders in the same monospace typeface used by the other themes.

---

### Edge Cases

- What happens when the configuration file is missing, unreadable, or malformed? The editor uses the default Rustic theme, and a valid configuration is written when the user next changes a setting.
- What happens when the configuration file holds an unknown or invalid theme name? The application falls back to the default Rustic theme and repairs the value when the user next saves a setting.
- What happens when the app theme is set to system but the OS does not report a preference? A Monotone theme falls back to the light scheme (black on white).
- What happens when the OS theme changes while the user is inside the settings window? The Monotone canvas and the rest of the application update consistently.
- What happens when the user has unsaved changes in an open document and switches the editor theme? The theme change is purely visual; document content and dirty state are unaffected.
- What happens when the user cancels the settings window after selecting a different theme? The theme stays at the last saved value.
- What happens when a document is open in the source view when the theme changes? The source view is untouched by the editor theme; only the formatted canvas is re-themed, and switching back to the formatted view shows the new theme.
- What happens when the editor theme changes while a transition or animation is in progress? The transition completes cleanly and renders the correct theme.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The settings window MUST provide an editor theme control listing exactly five themes: Rustic, Rustic Serif, Monotone, Monotone Serif, and Scholarly.
- **FR-002**: The default editor theme MUST be Rustic.
- **FR-003**: Selecting a theme and pressing Save in the settings window MUST apply the theme to the formatted editor canvas immediately, without requiring an application restart.
- **FR-004**: The editor theme selection MUST persist across application restarts.
- **FR-005**: The configuration file MUST store the selected theme by name; the visual values for each theme MUST live in the application code, not in the configuration file.
- **FR-006**: A missing, unreadable, malformed, or unknown theme value in the configuration file MUST fall back to the default Rustic theme without breaking the application.
- **FR-007**: The Rustic theme MUST match the current formatted editor canvas: a warm off-white background (`#fffdfb`), a modern sans-serif body typeface, headings in the same family at fixed progressively larger sizes, and monospace inline code.
- **FR-008**: The Rustic Serif theme MUST reproduce the Rustic theme exactly except that body text and headings render in a serif typeface.
- **FR-009**: The Monotone theme MUST render the canvas in a two-tone scheme matching the resolved app theme: black text on white in light mode, white text on black in dark mode.
- **FR-010**: When the app theme is set to system mode and a Monotone or Monotone Serif theme is active, the canvas MUST follow the operating system's light/dark mode, updating live while the application is running.
- **FR-011**: The Monotone Serif theme MUST reproduce the Monotone theme exactly except that body text and headings render in a serif typeface.
- **FR-012**: The Scholarly theme MUST render the canvas with a white background, headings in `#00B0E9` (RGB 0,176,233), a distinct Helvetica-like sans-serif body typeface, and the same monospace inline code as the other themes.
- **FR-013**: The editor theme MUST apply to the formatted WYSIWYG canvas only; the raw markdown source view MUST retain its existing styling and is not re-themed by this feature (clarification 2026-08-06).
- **FR-014**: Changing the editor theme MUST NOT alter the content, dirty state, or undo history of any open document.

### Key Entities *(include if feature involves data)*

- **Editor Theme**: One of the five named visual styles for the formatted editor canvas (Rustic, Rustic Serif, Monotone, Monotone Serif, Scholarly). Each theme's concrete values (colors, typefaces, sizes) live in the application code.
- **Editor Theme Setting**: The persisted configuration value that stores the name of the selected editor theme.
- **Resolved App Theme**: The effective light/dark appearance derived from the application theme setting and, when set to system, the operating system's current mode (spec 013). Monotone themes render against this value.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can change the editor theme from the settings window in under 5 seconds, and the formatted canvas reflects the change without a restart in 100% of tests.
- **SC-002**: The selected editor theme persists across 100% of clean application restarts.
- **SC-003**: In 100% of tests with a missing, malformed, or unknown theme value, the editor opens in the default Rustic theme and the application remains usable.
- **SC-004**: In 100% of tests, Monotone themes match the resolved app theme, and in system mode they update within 5 seconds of an OS theme change.
- **SC-005**: In 100% of tests, each of the five themes renders with its specified background, text color, heading color, and typeface as described in the requirements.
- **SC-006**: In 100% of tests, changing the editor theme leaves document content, dirty state, and undo history unchanged.

## Assumptions

- The editor theme name is stored in the same per-user application configuration file used for recent items and other settings (specs 004, 010, 012, 013).
- The editor theme is a setting of the application; per-document themes and custom theme editing are out of scope.
- Rustic is the baseline definition and equals the current formatted editor canvas appearance. The other four themes are derived from it as described.
- The serif faces used by Rustic Serif and Monotone Serif will be selected during planning from a freely distributable, Claude- or Apple-like serif (e.g., a New York/SF Serif-style face), consistent with the "improved helvetica" quality bar set for Scholarly's sans.
- The Scholarly body typeface is a distinct Helvetica-like sans-serif, separate from the Rustic family (clarification 2026-08-06).
- Monotone themes depend on the resolved app theme from the application theme setting (spec 013); they fall back to the light scheme when no preference is reported.
- The editor theme applies to the formatted WYSIWYG canvas only; the source view is out of scope (clarification 2026-08-06).
- The editor theme change is triggered by pressing Save in the settings window; there is no live preview requirement in this feature.
- Font size, line height, and other typography controls are out of scope; only the theme-provided values are changed.

## Clarifications

- **2026-08-06 — Scholarly body font is a distinct Helvetica-like sans.** The
  Scholarly body typeface is NOT the Rustic family; it is a separate, freely
  distributable Helvetica-like sans chosen during planning (amends FR-012 and
  US6 scenario 2).
- **2026-08-06 — Monotone follows the resolved app theme live.** When the app
  is in system mode, Monotone and Monotone Serif update live when the OS
  switches light/dark while the application is running (FR-010, US5 scenario 3).
- **2026-08-06 — Themes apply to the formatted canvas only.** The raw markdown
  source view retains its existing styling and is not re-themed (FR-013, US4/5
  edge cases).

## Addendum — Editor canvas polish (2026-08-07)

Requested during implementation as small visual corrections to the formatted
canvas (user request). They are **out of scope** for the editor-theme feature
itself but were folded into this PR because they touch the same editor surface
and the user asked for them. They are behavioural, CSS-only changes with no
schema, IPC, or document-state impact.

1. **Tight list-item spacing.** The 021 GitHub-style block spacing
   (`p { margin: 0 0 16px }`) applied to the inner `<p>` Crepe wraps each list
   item's text in, stacking onto `li { margin: 4px 0 }` and producing ~20px gaps
   between bullets. Inner list paragraphs are now zeroed (`li p { margin: 0 }`)
   so the `li` margin alone owns the rhythm — lists render tight like GitHub.
2. **Blockquote indent halved.** Crepe's reset pads blockquotes 40px left (with a
   4px coloured bar); the editor now overrides it to 20px — the default reads too
   wide inside a desktop canvas.
3. **Numbered-list vertical alignment.** Crepe fixes the list-marker label at
   `height: 32px`, but the body text line box is 24px, so a number's centre sat
   ~4px below its text line. The label height is matched to the 24px line box so
   marker and text line align vertically.
4. **HTML comments hidden in the visual editor.** `<!-- … -->` comments parse into
   inline `html` atom spans (`span[data-type="html"]`) that rendered their raw
   text. They are now hidden on the formatted canvas (`display: none`). The atom
   stays in the document and still round-trips to disk on save, so no content is
   lost — this is a presentation-only change.

These changes live in `src/renderer/editor/editor.css` and are covered by
e2e assertions in `tests/e2e/editor-theme.spec.ts` (visual + round-trip checks)
where they are visible on the theme canvas.
