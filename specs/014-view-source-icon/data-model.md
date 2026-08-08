# Data Model: Improved View Source Icon

This feature introduces **no entities and no runtime state**. The single
presentation object is the **View Source Icon** (spec "Key Entities"): the
top-bar button rendered by Crepe for the custom `view-source` group. Its
identifier fields are:

| Field | Value (unchanged) | Notes |
|-------|-------------------|-------|
| Group key | `view` / item key `view-source` | `CrepeHost.tsx` `buildTopBar` |
| DOM class | `.top-bar-item` (last child of `.top-bar-inner`) | Crepe `renderButton`; target for the 014 CSS |
| Accessible name / tooltip | `View source` | `toolbarLabels.ts` TOP_BAR_LABELS entry |
| Icon | code-chevron SVG path | `CrepeHost.tsx` `VIEW_SOURCE_ICON` |
| Behaviour | toggles source view | `onViewSourceRef` → store, unchanged (FR-007) |

## Validation rules

- The button MUST remain the last `.top-bar-item` in `.top-bar-inner` so both
  the CSS selector and the DOM-order label pipeline keep matching (FR-006, R1).
- The accessible name and tooltip MUST stay `View source` (FR-004).
- The accent treatment MUST resolve from the theme tokens (`--mm-accent`) so it
  stays effective and consistent in light and dark themes (FR-003/005).

## State transitions

None.
