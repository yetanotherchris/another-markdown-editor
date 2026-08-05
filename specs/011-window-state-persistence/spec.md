# Feature Specification: Window State Persistence

**Feature Branch**: `[011-window-state-persistence]`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Remember window location and size, which should be stored in the same application config file location as the MRU files."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Restore the Window on Startup (Priority: P1)

A user closes the application and, on the next launch, sees the window in the same position and at the same size as before. The application remembers and restores this state automatically.

**Why this priority**: Restoring the user's preferred window layout is the core value of the feature; without it, the feature has not delivered anything.

**Independent Test**: Open the application, move and resize the window, close it, reopen it, and verify the window appears in the saved position and size.

**Acceptance Scenarios**:

1. **Given** the application was previously closed with a known position and size, **When** the user launches it, **Then** the window opens at the saved position and size.
2. **Given** the saved window state is missing, **When** the user launches the application, **Then** the window opens at a sensible default position and size.

---

### User Story 2 - Persist Window Changes Automatically (Priority: P1)

A user can move or resize the window, and the application records these changes so they are available after the next restart.

**Why this priority**: Manual save actions for window layout are unexpected; automatic persistence is required for the feature to feel reliable.

**Independent Test**: Move and resize the window, close the application, and verify the new position and size are restored on the next launch.

**Acceptance Scenarios**:

1. **Given** the application is running, **When** the user moves the window, **Then** the new position is saved without requiring an explicit save action.
2. **Given** the application is running, **When** the user resizes the window, **Then** the new size is saved without requiring an explicit save action.
3. **Given** the user has maximized the window, **When** they close and reopen the application, **Then** the maximized state is restored.

---

### User Story 3 - Handle Display Changes Safely (Priority: P2)

A user can open the application even when the display that previously held the window is no longer available, or the saved rectangle is partially or fully off-screen. The window is repositioned to a visible, usable area.

**Why this priority**: Display layouts change (monitors disconnected, resolution changes, scaling changes). A window that restores off-screen or at an unusable size is worse than no memory at all.

**Independent Test**: Save a window position on a secondary monitor, disconnect that monitor, and reopen the application; verify the window appears on the remaining monitor.

**Acceptance Scenarios**:

1. **Given** the saved window position is outside the bounds of currently available displays, **When** the application launches, **Then** the window is repositioned to a visible area on an available display.
2. **Given** the saved window size is larger than the available display area, **When** the application launches, **Then** the window is resized to fit within the available display bounds.
3. **Given** the saved window position is on a display with a different scale factor than before, **When** the application launches, **Then** the window remains visible and usable.

---

### Edge Cases

- What happens when the configuration file is missing or unreadable? The window uses a default position and size.
- What happens when the saved window state is malformed? The window uses a default position and size and the malformed entry is replaced or repaired.
- What happens when the window is minimized on close? The restored window should not remain minimized; it should restore to the previous non-minimized state.
- What happens when the user has multiple virtual desktops or spaces? The window restores to a visible position on the available display, even if the original virtual desktop is unavailable.
- What happens when the window is maximized across a multi-monitor setup? The application restores the maximized state on the primary or available display.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST restore the main window's position and size from the saved state when it starts.
- **FR-002**: The application MUST persist the main window's position and size whenever the window is moved or resized, without requiring an explicit save action.
- **FR-003**: The window state MUST be stored in the same per-user application configuration file location used for the recent-items (MRU) list.
- **FR-004**: The saved window state MUST include at minimum the window's x position, y position, width, and height.
- **FR-005**: The saved window state MUST include the maximized state, and a maximized window MUST be restored maximized.
- **FR-006**: If the saved window state is missing, malformed, or the target display is unavailable, the application MUST fall back to a safe default position and size.
- **FR-007**: If the saved window rectangle would be partially or fully off-screen, the application MUST reposition and/or resize it so it is fully visible on an available display.
- **FR-008**: The window state MUST NOT be saved while the window is minimized or during a transition that would produce invalid values.
- **FR-009**: A failure to read or write the window state MUST be handled gracefully and MUST NOT prevent the application from starting or closing.

### Key Entities *(include if feature involves data)*

- **Window State**: The persisted representation of the main application window's position (x, y), size (width, height), and maximized state. It is stored in the per-user application configuration file.
- **Application Configuration File**: The per-user JSON file that holds both recent items and window state, located at the platform-appropriate configuration location.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of startup tests with valid saved state, the window restores to the saved position and size.
- **SC-002**: In 100% of persistence tests, a window move or resize is reflected in the configuration file within 1 second of the change completing.
- **SC-003**: In 100% of tests with a missing, malformed, or off-screen saved state, the window opens at a safe default position and size.
- **SC-004**: In 100% of multi-monitor tests where the saved display is disconnected, the window opens on a remaining display and is fully visible.
- **SC-005**: In 100% of startup tests, the application starts successfully even when the configuration file cannot be read or written.

## Assumptions

- The window state is stored in the same per-user configuration file as the recent-items list, at the platform-appropriate location established by the Recent Items feature.
- The feature applies to the single main application window only; multiple windows are out of scope.
- The safe default position and size are chosen by the platform or application defaults, not by the user.
- Fullscreen state is not persisted; only normal and maximized states are covered.
- Per-workspace or per-document window state is out of scope.
- The feature does not persist the window's z-order, virtual desktop assignment, or workspace-specific layout.
