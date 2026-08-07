# Feature Specification: Header Bar Shade

**Feature Branch**: `018-header-bar-shade`

**Created**: 2026-08-06

**Status**: Archived (implemented in `018-header-bar-shade`, merged to `main` 2026-08-07)

**Input**: User description: "The header bar in the wysiwg editor should be a shade of grey - slightly darker than the tab/pill grey"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visual Hierarchy Between the Editor Toolbar and the Tabs (Priority: P1)

The user opens a document in the WYSIWYG editor and sees the Milkdown editor
toolbar — the header bar of the editing view, housing the formatting icons. Its
background is a shade of grey that is visibly darker than the active tab pill,
so the toolbar reads as a distinct, slightly darker surface. The main app
header bar (containing the menu button, explorer toggle, and document tabs)
keeps its existing colour.

**Why this priority**: This is the entire feature. The visual distinction
between the editor toolbar and the tab pill is the only change being made.

**Independent Test**: Launch the application with a document open in the
formatted editor view. The Milkdown editor toolbar background is visibly darker
than the active tab pill. The main app header bar keeps its existing colour.
The change is purely cosmetic and does not affect any behaviour.

**Acceptance Scenarios**:

1. **Given** the application is open with a document in the formatted editor view, **When** the user looks at the editor toolbar, **Then** the Milkdown editor toolbar background is a shade of grey that is noticeably darker than the active tab pill background.
2. **Given** the application is open with at least one document tab, **When** the user looks at the main header area, **Then** the main app header bar background is unchanged (its existing colour).
3. **Given** the application is open with no document tabs, **When** the user looks at the header area, **Then** the main app header bar keeps its existing colour, and no tab pill is present.
4. **Given** the application is open with multiple tabs, **When** the user looks at the header area, **Then** the active tab pill is unchanged and remains the lightest tab element, and the editor toolbar stays visibly darker than the pill.

---

### Edge Cases

- The editor toolbar shade must remain visually distinct from both the active tab pill (lighter) and the editor content area below (white). It should not be so dark that it looks heavy or distracting.
- The change must not affect any other UI element: the main app header bar, sidebar, editor content, status bar, menus, dialogs, settings, and source view toolbar all retain their existing colours.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Milkdown editor toolbar background MUST be a shade of grey that is visibly darker than the active tab pill background.
- **FR-002**: The main app header bar background MUST remain unchanged (its existing colour, the spec-010 `--ame-surface` token).
- **FR-003**: The active tab pill background colour MUST NOT change.
- **FR-004**: The inactive tab appearance MUST NOT change.
- **FR-005**: No other UI element (main app header bar, sidebar, editor content, status bar, menus, dialogs, settings, source view toolbar) MAY be affected by this change.
- **FR-006**: The editor toolbar shade MUST remain visually distinct from the editor content area background (white in light mode) so the toolbar separates cleanly from the document.
- **FR-007**: When the application theme is set to dark mode (per spec 013), the editor toolbar MUST use a dark equivalent shade that maintains the same visual relationship: slightly darker than the dark-mode tab pill. The main app header bar keeps its existing dark colour.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can identify the editor toolbar as a distinct, slightly darker surface than the active tab pill at a glance, without needing to read labels.
- **SC-002**: The visual change is perceived as a subtle refinement; no user reports the toolbar as "too dark" or "jarring" compared to the rest of the interface.
- **SC-003**: The change introduces zero regressions in layout, tab interaction, or any other UI behaviour.
- **SC-004**: In dark mode, the editor toolbar remains visually distinct from the dark-mode tab pill with the same subtle shade relationship, and the main app header bar keeps its existing dark colour.

## Assumptions

- The current active tab pill colour (`#eaeaea`) remains the reference point for the editor toolbar shade. The toolbar moves darker relative to it, not the other way around.
- "Slightly darker" means a modest step in shade, enough to be noticeable but not a dramatic contrast shift. The intent is subtlety, not a bold visual statement.
- The main app header bar keeps its existing colour — this feature changes only the WYSIWYG editor toolbar.
- The dark theme equivalent will be defined when spec 013 (Theme Setting) is implemented, maintaining the same relative shade relationship.
- This is a cosmetic-only change. No theme variants or user-configurable options are introduced by this feature. One internal design token (`--ame-header`, a single static CSS custom property carrying the editor-toolbar shade in each theme) is added; it is not a token system, theme variant, or user option (clarified 2026-08-07).

## Clarifications

- **2026-08-07 — scope corrected (user decision)**: only the WYSIWYG editor toolbar changes. The earlier draft also darkened the main app header bar; the user confirmed the header bar with the tabs must keep its existing colour. FR-001/FR-002 were re-scoped accordingly, and FR-005 now explicitly protects the main app header bar.
- **2026-08-07 — FR-006 reworded**: the toolbar must be *visually distinct from* the editor content area, not "lighter than" it. The toolbar is darker than the white document canvas; the original wording was impossible and contradictory.
- **2026-08-07 — new internal token**: implementing the toolbar shade is done with one new CSS custom property, `--ame-header` (darker than the active tab pill in both themes). No existing `--ame-*` token is both darker than the pill and safe to retarget without changing a protected element (FR-005). This amends the "no new design tokens" assumption.
