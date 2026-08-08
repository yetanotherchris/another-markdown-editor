# Contract: View Source Button Presentation

The presentation contract for the View source top-bar button (spec 014).
It is a **renderer DOM contract**, not an IPC contract.

## Fixed DOM shape (unchanged)

```text
div.milkdown-top-bar
  └── div.top-bar-inner
        ├── div.top-bar-heading-selector …
        ├── button.top-bar-item  (×15 formatting controls)
        ├── div.top-bar-divider
        └── button.top-bar-item  ← LAST child: the View source button
```

The View source button is the last `.top-bar-item` inside `.top-bar-inner`
(the custom `view` group is appended by `buildTopBar`).

## Presentation rules

| Rule | Selector | Declaration |
|------|----------|-------------|
| R1 | `.top-bar-inner > .top-bar-item:last-child svg` | `color: var(--mm-accent); fill: var(--mm-accent)` |
| R2 | `.top-bar-inner > .top-bar-item:last-child` | translucent accent background (`color-mix(in srgb, var(--mm-accent) 14%, transparent)`), rounded to match sibling buttons |
| R3 | hover/active | stays on the accent family (darker on hover via `color-mix` with more accent), never reverts to outline |

## Invariants (must never break)

- Accessible name and tooltip: `View source` (FR-004).
- The button keeps Crepe's `.top-bar-item` size, alignment, and icon family
  (FR-006).
- Clicking it still enters source view; the shortcut and transition are
  unchanged (FR-007).
- Works in light and dark themes (FR-005) because the accent is the theme token.

## Verification

- e2e (`tests/e2e/view-source-icon.spec.ts`): computed `color` of the last
  top-bar item's `svg` equals the resolved `--mm-accent`, the tooltip is
  `View source`, and a non-accent formatting button (e.g. Bold) still uses the
  muted outline colour — proving the icon stands out from its neighbours.
- Existing `source.spec.ts` must keep passing (behaviour + labels unchanged).
