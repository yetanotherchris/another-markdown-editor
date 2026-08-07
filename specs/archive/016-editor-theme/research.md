# Research: Editor Theme

**Feature**: 016-editor-theme | **Date**: 2026-08-07

Evidence collected during planning. Each decision cites the check it rests on.

## R1 — Crepe's canvas is fully token-driven

Verified in `node_modules/@milkdown/crepe/lib/theme/crepe/style.css` (the "classic"
theme the app loads via `@milkdown/crepe/theme/classic.css`):

```css
.milkdown {
  --crepe-color-background: #fdf6e3;      /* warm off-white canvas */
  --crepe-color-on-background: #1f1b16;   /* body text */
  --crepe-font-title: Georgia, Cambria, 'Times New Roman', Times, serif;
  --crepe-font-default: 'Open Sans', Arial, Helvetica, sans-serif;
  --crepe-font-code: Fira Code, Menlo, Monaco, 'Courier New', Courier, monospace;
  ... --crepe-color-surface, -outline, -primary, -inline-code, -selected, etc.
}
```

Two consequences:

1. **Rustic derives from the current canvas.** The Inter `--crepe-font-*`
   override in `App.css` (spec 003/012) and Crepe's warm base already define the
   Rustic look; the theme block re-asserts the tokens so the theme is
   self-contained in code (FR-005). The canvas background was warmed from the
   near-white `#fffdfb` to the cream `#fdf6e3` (user decision 2026-08-07) — so
   the block is no longer a pure no-op for the background, but it remains a
   single-token swap.
2. **Themes are CSS swaps.** Every theme is a `.app-container[data-editor-theme='X']
   .milkdown { ... }` block redefining the tokens; the selector is more specific
   than the bare `.milkdown`, so source order is irrelevant. Inline code follows
   `--crepe-font-code` (unchanged across themes, FR-012 scenario 3).

## R2 — Font stacks: freely distributable, distinct, already present

The spec requires (Assumptions, Clarification 2026-08-06) that the serif and the
Scholarly sans be freely distributable and distinct from the Rustic family.

- **Serif (Rustic Serif / Monotone Serif)**: reuse the spec-012 serif stack
  already shipped in this codebase — `Georgia, 'Times New Roman', 'Noto Serif', serif`
  (verified in `src/renderer/App.css`). Georgia is a system serif on every target
  platform; no new font dependency. The New York/SF Serif-style quality bar is met
  by Georgia's humanist serif structure.
- **Scholarly Helvetica-like sans**: `Arial, 'Helvetica Neue', Helvetica, sans-serif`.
  Arial is the classic freely-distributable Helvetica substitute and is distinct
  from Inter (the Rustic family), satisfying the Clarification 2026-08-06 that the
  Scholarly body face be a *separate* family. No new dependency.

Both are system stacks; nothing ships in the bundle beyond the existing Inter
`@fontsource` package (spec 003).

## R3 — Monotone rides the existing `data-theme` resolution

Spec 013 already resolves the **resolved app theme** onto `.app-container`'s
`data-theme` attribute (`src/renderer/hooks/useEffectiveTheme.ts`):

- `themeOverride` (`'light' | 'dark' | null`) + the renderer's
  `prefers-color-scheme` query → `effectiveThemeMode` → `themeMode` → `data-theme`.
- In system mode the matchMedia `change` listener re-resolves on every OS switch
  (spec 013 FR-005 live following, e2e-driveable with Playwright `emulateMedia`).
- When the OS reports no preference (`prefers-color-scheme` false), the mode
  falls back to `'light'`.

Therefore Monotone's light/dark variants scoped under
`.app-container[data-theme='light'|'dark'][data-editor-theme='monotone'] .milkdown`
inherit live OS following (FR-010) and the light fallback (FR-010 scenario 4)
with **no new mechanism** — a pure CSS selector over an attribute that already
exists and already updates live. This is the cheapest correct implementation and
keeps the renderer free of any new Electron/nativeTheme surface (Principle I).

## R4 — The dialog currently applies settings immediately; the spec requires Save

`src/renderer/chrome/SettingsDialog.tsx` today applies every selection immediately
on radio click (spec 012 font, spec 013 theme) with only a Close button. Spec 016
FR-003/US1 S2/S4 explicitly require the editor theme to change **only when the
Save button is pressed** and to stay unchanged when the dialog closes without
Save. The dialog therefore gains:

- a **staged** editor-theme selection (local `draftEditorTheme` state, seeded from
  the committed prop), and
- a **Save** button that commits the staged value via a parent callback
  (`onEditorThemeSave` → `handleEditorThemeChange`) then closes.

The app **Theme** group (spec 013) keeps its immediate-apply behavior — its
archived e2e tests (`theme.spec.ts` US1/US2) assert the canvas/chrome changes the
moment the radio is checked, and spec 016 does not ask to re-gate it. This is the
only combination that satisfies both archived and new acceptance scenarios.

## R5 — Dark-mode canvas override removal

`src/renderer/App.css` today carries
`.app-container[data-theme='dark'] .milkdown { --crepe-color-background: #1f1f1f ... }`
(spec 013 FR-010, dark editing surface). Under the user decision "the editor theme
owns the canvas; only Monotone follows the app theme", that block must be removed
so Rustic/Scholarly keep their fixed palettes in dark chrome. The chrome palette
(`--ame-*`, sidebar, header, tabs) is untouched — spec 013's app-theme behavior is
preserved; only the *canvas* stops following dark mode except for Monotone. The
archived `theme.spec.ts` FR-010 test is updated to assert: default Rustic canvas
stays `#fdf6e3` in dark mode; Monotone flips to black/white.
