# Feature Specification: Header Bar Shade

**Feature Branch**: `018-header-bar-shade`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "The header bar in the wysiwg editor should be a shade of grey - slightly darker than the tab/pill grey"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visual Hierarchy Between Headers and Tabs (Priority: P1)

The user opens the application and sees two header bars that house icons: the main app header bar (containing the menu button, explorer toggle, and document tabs) and the Milkdown editor toolbar (containing formatting icons). Both header bar backgrounds are a shade of grey that is visibly darker than the active tab pill, creating a clear visual layering: the tab pill sits "on top of" the header bar because it is lighter.

**Why this priority**: This is the entire feature. The visual distinction between the header surfaces and the tab pill is the only change being made.

**Independent Test**: Launch the application with at least one open tab. Both the main app header bar and the Milkdown editor toolbar backgrounds are visibly darker than the active tab pill. The change is purely cosmetic and does not affect any behaviour.

**Acceptance Scenarios**:

1. **Given** the application is open with at least one document tab, **When** the user looks at the main header area, **Then** the main app header bar background is a shade of grey that is noticeably darker than the active tab pill background.
2. **Given** the application is open with a document in the formatted editor view, **When** the user looks at the editor toolbar, **Then** the Milkdown editor toolbar background is the same shade of grey as the main app header bar, and is noticeably darker than the active tab pill.
3. **Given** the application is open with no document tabs, **When** the user looks at the header area, **Then** the main app header bar background is the same darker grey shade, and the tab pill is not present.
4. **Given** the application is open with multiple tabs, **When** the user looks at the header area, **Then** all inactive tabs and both header bars are darker than the active tab pill, and the active tab pill remains the lightest element in the header area.

---

### Edge Cases

- The header bar shade must remain visually distinct from both the active tab pill (lighter) and the editor content area below (white). It should not be so dark that it looks heavy or distracting.
- The change must not affect any other UI element: sidebar, editor content, status bar, menus, dialogs, settings, and source view toolbar all retain their existing colours.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The main app header bar background MUST be a shade of grey that is visibly darker than the active tab pill background.
- **FR-002**: The Milkdown editor toolbar background MUST be the same shade of grey as the main app header bar.
- **FR-003**: The active tab pill background colour MUST NOT change.
- **FR-004**: The inactive tab appearance MUST NOT change.
- **FR-005**: No other UI element (sidebar, editor content, status bar, menus, dialogs, settings, source view toolbar) MAY be affected by this change.
- **FR-006**: The header bar shade MUST remain lighter than the editor content area background to maintain visual separation between the header and the document.
- **FR-007**: When the application theme is set to dark mode (per spec 013), both header bars MUST use a dark equivalent shade that maintains the same visual relationship: slightly darker than the dark-mode tab pill.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can identify the active tab pill as a distinct, lighter element against both header bar backgrounds at a glance, without needing to read tab labels.
- **SC-002**: The visual change is perceived as a subtle refinement; no user reports the headers as "too dark" or "jarring" compared to the rest of the interface.
- **SC-003**: The change introduces zero regressions in layout, tab interaction, or any other UI behaviour.
- **SC-004**: In dark mode, both header bars remain visually distinct from the dark-mode tab pill with the same subtle shade relationship.

## Assumptions

- The current active tab pill colour (`#eaeaea`) remains the reference point for the header bar shade. The header bars move darker relative to it, not the other way around.
- "Slightly darker" means a modest step in shade, enough to be noticeable but not a dramatic contrast shift. The intent is subtlety, not a bold visual statement.
- Both header bars (main app header and Milkdown editor toolbar) use the same shade to maintain visual consistency across the interface.
- The dark theme equivalent will be defined when spec 013 (Theme Setting) is implemented, maintaining the same relative shade relationship.
- This is a cosmetic-only change. No new design tokens, theme variants, or user-configurable options are introduced by this feature.
