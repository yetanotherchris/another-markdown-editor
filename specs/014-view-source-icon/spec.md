# Feature Specification: Improved View Source Icon

**Feature Branch**: `[014-view-source-icon]`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "An improved view source icon, that makes it obvious (perhaps a different colour icon) the option is available."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover the View Source Action (Priority: P1)

A user can immediately locate the View source action in the formatted editor toolbar because its icon is visually distinct and clearly communicates its purpose.

**Why this priority**: The current icon is reportedly not obvious enough; the primary goal of this feature is to make the action discoverable.

**Independent Test**: A user who has not used the application before can identify the View source icon in the toolbar within 5 seconds.

**Acceptance Scenarios**:

1. **Given** the formatted editor toolbar is visible, **When** the user looks at the View source icon, **Then** it stands out from the surrounding controls.
2. **Given** the formatted editor toolbar is visible, **When** the user hovers over or focuses the View source icon, **Then** an explanatory tooltip identifies it as "View source" or equivalent.
3. **Given** the user is looking for the source-editing option, **When** they scan the toolbar, **Then** the View source icon is the most visually prominent action related to raw markdown editing.

---

### User Story 2 - Recognize the View Source Icon's Meaning (Priority: P1)

A user can understand what the View source icon does without clicking it, based on its visual metaphor and styling.

**Why this priority**: Discoverability is only useful if the user also understands the action; the icon must communicate "source" or "raw text".

**Independent Test**: A user is shown the icon and asked what it does; at least 80% correctly identify it as switching to a source view.

**Acceptance Scenarios**:

1. **Given** the View source icon is visible, **When** a user sees it for the first time, **Then** its visual design suggests code, markup, or raw text.
2. **Given** the View source icon is visible, **When** a user sees it for the first time, **Then** its styling clearly differentiates it from formatting controls such as bold or italic.

---

### User Story 3 - Maintain Consistency with the Rest of the UI (Priority: P2)

The improved View source icon remains consistent with the application's overall design language, even while being more prominent.

**Why this priority**: An icon that is too different can look out of place or unprofessional; the improvement should be deliberate, not jarring.

**Independent Test**: A user compares the icon to the rest of the toolbar and confirms it is more noticeable but still belongs in the interface.

**Acceptance Scenarios**:

1. **Given** the user is viewing the full toolbar, **When** they compare the View source icon to other icons, **Then** it is visibly distinct but uses the same icon family, size, and alignment.
2. **Given** the user is viewing the full toolbar, **When** they compare the View source icon to other icons, **Then** any color difference is intentional and consistent with the application's accent or semantic color usage.

---

### Edge Cases

- What happens when the icon is shown in a dark theme? The icon remains visible and the color difference remains effective.
- What happens when the icon is shown in a light theme? The icon remains visible and the color difference remains effective.
- What happens when the user is in source view? The icon for returning to the formatted view should be similarly clear, but this feature focuses on the View source icon in the formatted editor.
- What happens when the toolbar is crowded? The View source icon must remain prominent and not be hidden or reduced to an indistinguishable size.
- What happens when the user has a screen-reader or keyboard-only workflow? The icon must still have a clear accessible label and focus state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The formatted editor toolbar MUST provide a View source icon that is visually distinct from the other toolbar controls.
- **FR-002**: The View source icon MUST visually communicate that it switches to a source or raw-text view.
- **FR-003**: The View source icon MAY use a different color or accent treatment to increase its visibility, provided the treatment is consistent with the application's design language.
- **FR-004**: The View source icon MUST retain an accessible name and tooltip that identify it as "View source" or equivalent.
- **FR-005**: The View source icon MUST remain visually effective in both light and dark themes.
- **FR-006**: The View source icon MUST use the same icon family, size, and alignment as the surrounding toolbar controls.
- **FR-007**: The change MUST NOT alter the existing View source behavior, transition, or keyboard shortcut.

### Key Entities *(include if feature involves data)*

- **View Source Icon**: The toolbar control that activates the source view for the current document. This feature changes only its visual presentation and prominence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability testing, at least 90% of users can identify the View source icon within 5 seconds of seeing the toolbar.
- **SC-002**: In usability testing, at least 80% of users can correctly describe the icon's purpose without clicking it.
- **SC-003**: The icon remains visually distinct from neighboring controls in both light and dark themes.
- **SC-004**: The icon's accessible name and tooltip are unchanged and correctly identify the action.

## Assumptions

- This feature changes only the visual presentation of the View source icon; the underlying View source behavior, transition, and keyboard shortcut remain unchanged.
- The icon belongs to the formatted editor toolbar and is the entry point for switching the current tab to source view.
- The icon will be selected from the same icon family as the rest of the toolbar to maintain consistency.
- The color or accent treatment used to make the icon prominent will align with the application's color palette and semantic color usage.
- The return-to-formatted-view icon is out of scope unless it is also found to be unclear during planning.
