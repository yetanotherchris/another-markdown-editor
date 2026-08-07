# Implementation Plan: Header Bar Shade

**Branch**: `018-header-bar-shade` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-header-bar-shade/spec.md`

## Summary

Make the **Milkdown editor toolbar** (the header bar of the WYSIWYG editing
view) a shade of grey that is visibly darker than the active tab pill
(FR-001), without changing the active/inactive tab appearance (FR-003,
FR-004), the **main app header bar** (FR-002), any other UI element (FR-005),
or the light editor content area (FR-006). The same visual relationship holds
in dark mode (FR-007).

**The defining decision**: the chrome is already styled entirely through the
`--ame-*` custom properties (spec 010; verified research R4 for 013). The
editor toolbar today resolves a surface that is **lighter** than the
`#eaeaea` active tab pill: the Crepe top bar uses `var(--crepe-color-surface)`
= `#fff8f4` in the classic light theme, `#2a2a2a` in dark (App.css dark block).

The spec says "slightly darker than the tab/pill grey". The pill is
`--ame-active-tab` (`#eaeaea` light / `#2d2d2d` dark) and FR-003 forbids moving
it. So the editor toolbar moves **darker** relative to the pill — the exact
inverse of the current relationship. A single new token, `--ame-header`,
expresses the toolbar shade in both themes:

- `--ame-header: #e0e0e0` (light) — a modest step darker than `#eaeaea`
  (~10 RGB units), clearly distinct from the white editor canvas.
- `--ame-header: #262626` (dark) — a modest step darker than `#2d2d2d`,
  between the pill and the `#1f1f1f` editor canvas.

**The main app header bar is NOT changed** — it keeps `--ame-surface`
(`#f9f9fb` light / `#1f1f1f` dark), its existing colour (FR-002; user decision
2026-08-07, see decision log).

No new IPC, no renderer logic, no editor code. This is a stylesheet-only
change: one new token plus one override on the Crepe top bar.

## Technical Context

**Language/Version**: TypeScript 5.8 strict; CSS custom properties.

**Primary Dependencies**: None new. The change reuses the existing spec-010
token mechanism and the existing `.milkdown-top-bar` DOM node Crepe renders for
its TopBar feature (already enabled in `CrepeHost.tsx`).

**Storage**: None — no settings, no config, no schema.

**Testing**: Playwright e2e via `npm run test:e2e` (builds + launches Electron).
New suite `tests/e2e/header-bar-shade.spec.ts` asserts, in light and dark, that
(1) the editor toolbar resolves the toolbar shade, (2) the main app header bar
is unchanged, (3) the active tab pill stays `#eaeaea` / `#2d2d2d`, (4) the
toolbar shade is strictly darker than the pill and visually distinct from the
editor canvas, and (5) the sidebar, status bar, main header bar and source
toolbar are untouched (FR-005). No unit tests: there is no logic.

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), three build targets.

**Performance Goals**: None — a static CSS change; no work on any interaction
path.

**Constraints**: Renderer sandboxed. No Electron in the renderer. The toolbar
token stays scoped to the editor toolbar — `--ame-surface`,
`--ame-surface-secondary`, `--ame-active-tab`, `--ame-border`, `--ame-bg` are
all used by other elements and must not move (FR-005). The Crepe top-bar
background is overridden **directly** on `.milkdown .milkdown-top-bar` rather
than by redefining `--crepe-color-surface`, because that token also paints the
table cells, the top-bar heading dropdown, and other Crepe surfaces — changing
it would violate FR-005.

**Scale/Scope**: One CSS rule added and one token value per theme. Out of
scope: the main app header bar (explicitly unchanged, FR-002), the top-bar
heading dropdown popover surface (a transient panel, not "the toolbar
background"), any source-view toolbar change (explicitly excluded by FR-005),
and any tab appearance change (FR-003/FR-004).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | No IPC, no preload, no new renderer surface. Pure CSS on existing DOM | **PASS** |
| II. Every Path Is Untrusted | No paths cross the IPC | **PASS** |
| III. Never Lose The User's Words | No document, dirty state, or save path touched | **PASS** |
| IV. Calm, Predictable Editing | A static stylesheet change; nothing on the keystroke path; the editing surface is untouched | **PASS** |
| V. Test What Can Corrupt Or Escape | Cosmetic; e2e pins the toolbar shade, the unchanged main header bar, the unchanged pill, and the untouched elements in both themes | **PASS** |

## Phase 1 Design decisions

**A new `--ame-header` token (`src/renderer/App.css`)** — added to `:root` and
to the `.app-container[data-theme='dark']` block:

```css
:root {
  --ame-header: #e0e0e0;   /* WYSIWYG editor toolbar; darker than the tab pill */
}
.app-container[data-theme='dark'] {
  --ame-header: #262626;   /* a step darker than the dark pill #2d2d2d */
}
```

The spec assumption said "no new design tokens"; the reality is that no
existing token is both darker than `--ame-active-tab` and safe to retarget
(every other surface token is used by elements FR-005 protects — see research
R2). One new custom property is the minimal, single-source-of-truth mechanism;
it is a static palette value, not a token *system*, theme variant, or user
option. Recorded as a spec clarification (spec.md).

**Main app header bar (`src/renderer/chrome/chrome.css`) — UNCHANGED.** The
`.header-bar` keeps `background: var(--ame-surface)`. No edit to this file.

**Editor toolbar (`src/renderer/editor/editor.css`)** — a targeted override:

```css
.milkdown .milkdown-top-bar {
  background: var(--ame-header);
}
```

The selector matches Crepe's own top-bar rule's specificity, and `editor.css`
is imported after the Crepe theme css (`main.tsx` imports the crepe themes
first, then `App.tsx` imports `App.css`/`editor.css`), so it wins the cascade
(R3). Only the top bar's own background changes; `--crepe-color-surface`
keeps its values for the table cells and the heading dropdown (R1, FR-005).

The toolbar's bottom hairline and its icon/label colors are unchanged — the spec
only changes the surface shade.

## Project Structure

### Documentation (this feature)

```text
specs/018-header-bar-shade/
├── spec.md              # Requirements (FR-001…FR-007, US1, edge cases)
├── plan.md              # This file
├── research.md          # R1…R4 evidence (token boundary, surface usage, cascade)
├── quickstart.md        # Manual verification script
├── contracts/
│   └── renderer.md      # E2e contract for the shade assertions
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/renderer/
├── App.css              # MODIFY: --ame-header token in :root and [data-theme='dark']
└── editor/editor.css    # MODIFY: .milkdown .milkdown-top-bar background → var(--ame-header)
```

```text
tests/e2e/
└── header-bar-shade.spec.ts   # NEW: toolbar shade, unchanged main header bar,
                               #   unchanged pill/other elements, light + dark
```

**Structure decision**: the token lives with the other `--ame-*` palette
definitions in `App.css` (spec 010's single token source); the consumer rule
lives in its co-located stylesheet (`editor.css`), matching the spec-017
stylesheet restructure. `chrome.css` is untouched.

## Phase status

- Phase 1: Setup — green baseline on `018-header-bar-shade` (created from clean
  `main` per AGENTS.md; branch already created)
- Phase 2: Implement — the `--ame-header` token + the editor-toolbar override
- Phase 3: E2e — `header-bar-shade.spec.ts` (light + dark, FR-001…FR-007)
- Phase 4: Gate — `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run test:e2e`, `npm run check` all green; archive the spec

## Deferred / later features

- A dedicated `016-editor-theme` spec may later take finer control of Crepe's
  surfaces; this feature deliberately keeps its change to the editor toolbar.
- The top-bar heading-dropdown popover keeps Crepe's `--crepe-color-surface`
  background; restyling it is out of scope for this cosmetic change.

## Complexity tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| Adding one new design token (`--ame-header`) despite the spec's "no new design tokens" assumption | No existing `--ame-*` token is darker than `--ame-active-tab` and safe to retarget: `--ame-surface` and `--ame-surface-secondary` are lighter (wrong direction), `--ame-border` is a hairline border color shared by every element edge, and `--ame-control`/`--ame-bg` are used for buttons/backgrounds. The token is a single static palette value — not a token system, theme variant, or user option | Repurposing `--ame-border` as the toolbar surface, or duplicating the hex literal in the stylesheet (two sources of truth for one shade) |
| Overriding the Crepe top-bar background directly instead of redefining `--crepe-color-surface` | `--crepe-color-surface` also paints the table-cell backgrounds and the top-bar heading dropdown (R1); changing the token would recolor those non-header surfaces, violating FR-005. The top bar is the only header surface | Redefining `--crepe-color-surface` on `.milkdown` (correct shade on the toolbar but recolors tables and the heading dropdown too) |

## Decision log

### 2026-08-07

- **New `--ame-header` token**: the editor toolbar resolves a single new custom
  property (`#e0e0e0` light, `#262626` dark). The spec's "no new design tokens"
  assumption is amended via clarification — see the complexity table.
- **Targeted top-bar override**: `.milkdown .milkdown-top-bar` gets an explicit
  `background: var(--ame-header)`; `--crepe-color-surface` is left for Crepe's
  other surfaces (R1).
- **`#e0e0e0` / `#262626`**: a modest, clearly-visible step darker than the
  pill — `#eaeaea → #e0e0e0` and `#2d2d2d → #262626` — keeping the pill the
  lighter element (FR-001/FR-007) while staying subtle (spec edge case). Exact
  values are cheap to adjust.
- **FR-006 reworded**: the original "lighter than the editor content area" is
  impossible for a grey surface on a white document and contradicted FR-001's
  "darker than the pill"; the intent (spec edge case: "visually distinct from
  the editor content area below (white)") is now what the requirement says.
- **Scope corrected (user decision)**: the first implementation also darkened
  the main app header bar. The user confirmed the header bar with the tabs must
  keep its existing colour, so the `.header-bar` change was reverted; only the
  editor toolbar moves darker. FR-001/FR-002 were re-scoped and FR-005 now
  protects the main app header bar. `chrome.css` is back to its original state.
