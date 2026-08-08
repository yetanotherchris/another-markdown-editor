# Research: Improved View Source Icon

## R1 — Crepe offers no per-item class; target the appended group's position

**Decision**: Style the View source button via CSS
`.top-bar-inner > .top-bar-item:last-child` in `editor.css`.

**Rationale**: Verified in `@milkdown/crepe` source (v7.21.3): `TopBarItem` is
`{ active, icon, selector? }`, `renderButton` hard-codes `class="top-bar-item"`
(`feature/top-bar/component.tsx`), and the app's `buildTopBar` appends the
custom "view-source" group last (`CrepeHost.tsx`). With the fixed feature set
(`TopBar: true`, toolbar/block-edit off — the same determinism the existing
`toolbarLabels.ts` documents), the view-source button is always the last
`.top-bar-item`. No Crepe fork or API extension is needed.

**Alternatives considered**: forking/contributing a `class` option to Crepe's
top-bar (rejected — vendor patch, no benefit); wrapping the icon in a styled
span (rejected — Crepe renders only the raw SVG inside the button).

## R2 — Icon colour via the button `svg`, using the app accent token

**Decision**: Override the button's `svg` to `color: var(--mm-accent); fill:
var(--mm-accent)` and give the button a translucent accent background.

**Rationale**: Crepe's top-bar CSS already colours `.top-bar-item svg` with
`--crepe-color-outline` (`theme/common/top-bar.css`), so overriding it on the
last item is the minimal, reliable lever. `--mm-accent` is the app's
theme-aware semantic accent (`#d96b27` light / `#3794ff` dark, `App.css`),
satisfying FR-003 (deliberate accent usage) and FR-005 (effective in both
themes). A translucent accent background (`color-mix` with 14% accent) makes the
button read as the most prominent action without changing its size or alignment
(FR-006).

**Alternatives considered**: a hard-coded brand colour (rejected — ignores the
theme token and FR-003); a filled accent background (rejected — too loud,
breaks FR-003 "belongs in the interface").

## R3 — Icon glyph stays the code-chevron

**Decision**: Keep the existing code-chevron path; change only colour/prominence.

**Rationale**: The glyph (`< >` chevrons) is the standard "code/source" metaphor
and already satisfies FR-002; the discoverability problem the feature targets
is the colour/prominence, not the shape (spec Input: "perhaps a different colour
icon").

**Alternatives considered**: replacing with a different glyph (rejected — the
current one already reads as source, and a new glyph risks FR-006 drift).

## R4 — Behaviour, labels, and DOM order are untouched

**Decision**: No change to `CrepeHost.tsx`, `toolbarLabels.ts`, the
`view-source` group wiring, or any main-process code. The button keeps its
DOM position and its title/aria-label pipeline.

**Rationale**: FR-004 requires the accessible name/tooltip unchanged; FR-007
requires behaviour, transition, and shortcut unchanged. `toolbarLabels.ts`
matches controls by DOM order, and the button stays the last control, so
labelling continues to work. The e2e suite (e.g. `source.spec.ts` locating the
button by role/name "View source") keeps passing because the accessible name is
unchanged.

**Alternatives considered**: none — FR-007 forbids behavioural changes.
