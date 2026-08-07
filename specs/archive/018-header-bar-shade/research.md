# Research: Header Bar Shade

**Feature**: `018-header-bar-shade` | **Date**: 2026-08-07

Evidence gathered against the installed source (verified, not assumed).

## R1 — The Crepe toolbar background is `--crepe-color-surface`, shared with other surfaces

`node_modules/@milkdown/crepe/src/theme/common/top-bar.css:8` styles
`.milkdown .milkdown-top-bar { background: var(--crepe-color-surface); }`. The
same token paints other surfaces:

- `src/theme/common/toolbar.css:13` — `.milkdown-toolbar` (the floating toolbar,
  disabled in this app via `CrepeFeature.Toolbar: false`).
- `src/theme/common/top-bar.css:88` — the top-bar heading **dropdown** panel.
- `src/theme/common/table.css` — table-cell backgrounds (4 uses).

**Conclusion**: redefining `--crepe-color-surface` for the toolbar would also
recolor the heading dropdown and table cells (non-header surfaces, FR-005).
The top-bar background must be overridden **directly** on
`.milkdown .milkdown-top-bar`.

## R2 — No existing `--ame-*` token can carry the header shade without moving a protected element

Current token values (`App.css:57-71`, dark block `83-97`):

| Token | Light | Dark | Used by (grep of `src/renderer`) |
|-------|-------|------|----------------------------------|
| `--ame-bg` | `#ffffff` | `#1f1f1f` | dialogs, source-return button |
| `--ame-surface` | `#f9f9fb` | `#1f1f1f` | `.header-bar`, status bar, settings rows, explorer tree |
| `--ame-surface-secondary` | `#f8f8fa` | `#181818` | sidebar, hovers, source toolbar |
| `--ame-active-tab` | `#eaeaea` | `#2d2d2d` | tab pill (FR-003: must not move) |
| `--ame-border` | `#e5e5e5` | `#3a3a3a` | every element edge/border |
| `--ame-border-secondary` | `#ececec` | `#333333` | separators |
| `--ame-control` | `#2d2d2d` | `#3a3a3a` | settings buttons |

`--ame-surface`/`--ame-surface-secondary` are **lighter** than the pill — the
wrong direction. `--ame-border` is the one existing value darker than the pill
in light mode, but it is the header-bar's own `border-bottom` color and every
other border; using it as the surface makes the header's bottom edge
invisible. `--ame-active-tab` is frozen by FR-003. A dedicated `--ame-header`
token is the only option that keeps FR-005 intact.

## R3 — Cascade order lets our override win without a specificity hack

`src/renderer/main.tsx` imports `@milkdown/crepe/theme/classic.css` and
`common/style.css` **before** `App.tsx`, and `App.tsx` imports `App.css` then
`editor.css` last (`App.tsx:27-29`). Crepe's own rule is
`.milkdown .milkdown-top-bar` (0,2,0). A matching
`.milkdown .milkdown-top-bar` override in `editor.css` therefore wins on equal
specificity by source order, and it also beats the dark-mode
`.app-container[data-theme='dark'] .milkdown` custom-property assignment, which
only *sets* `--crepe-color-surface` on an ancestor.

## R4 — The spec-010/013 token mechanism is the established pattern

Spec 013 verified that every chrome surface resolves the `--ame-*` tokens from
`.app-container` (plan R4), so a theme is a single token-block swap. Adding one
token to that block is the smallest consistent extension; the dark-mode value
is simply added to the existing `.app-container[data-theme='dark']` block.

## Color rationale

- Light `#e0e0e0` vs pill `#eaeaea`: 10 RGB units darker per channel —
  noticeable at a glance (SC-001), still subtle (spec edge case), clearly below
  the `#ffffff`/`#fffdfb` editor canvas (FR-006) and below the `#e5e5e5` border
  hairline.
- Dark `#262626` vs pill `#2d2d2d`: 7 RGB units darker — the same "a step
  below the pill" relationship on the VS Code Dark palette (FR-007), sitting
  between the pill and the `#1f1f1f` editor canvas.
- Values are easily tuned; the e2e contract (contracts/renderer.md) pins the
  *relationship* (strictly darker than the pill, strictly lighter than the
  canvas) so a retune does not silently invert it.

## Scope correction (2026-08-07)

The first implementation also retargeted `.header-bar` onto the new token. The
user confirmed the main app header bar (with the tabs) must keep its existing
colour, so `.header-bar` stays `var(--ame-surface)` (FR-002) and `chrome.css`
is unchanged. Only `.milkdown .milkdown-top-bar` resolves `--ame-header`.
