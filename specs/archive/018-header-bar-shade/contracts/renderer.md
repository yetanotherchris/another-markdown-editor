# Contracts: Header Bar Shade (Renderer)

**Feature**: `018-header-bar-shade` | **Date**: 2026-08-07 | **Spec**: [spec.md](../spec.md)

## DOM surface

The changed surface is the WYSIWYG editor toolbar:

- `.milkdown .milkdown-top-bar` — the Crepe WYSIWYG editor toolbar
  (`CrepeHost.tsx` enables `CrepeFeature.TopBar`; styled in
  `src/renderer/editor/editor.css`).

It resolves the `--ame-header` token defined in `App.css` (`:root` light value
and the `.app-container[data-theme='dark']` dark value). The active tab pill is
`.tab.active` (`background: var(--ame-active-tab)`).

The main app header bar (`.header-bar`, `src/renderer/App.tsx:190`, styled in
`chrome.css`) is **unchanged** — it keeps `var(--ame-surface)` (FR-002).

## §E2e — e2e contract (`tests/e2e/header-bar-shade.spec.ts`)

Assertions use `getComputedStyle(el).backgroundColor` (always returns an
`rgb(r, g, b)` string). The relationship checks compare channel sums so the
exact hex values can be tuned without the suite being rewritten.

| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | Light, one open tab (US1, FR-001) | `.milkdown-top-bar` equals the toolbar shade `rgb(224, 224, 224)` and is strictly **darker** than the active `.tab.active` pill `rgb(234, 234, 234)` |
| 2 | FR-002 | `.header-bar` keeps its existing `--ame-surface` background `rgb(249, 249, 251)` |
| 3 | FR-003/FR-004 | Active pill background is exactly `rgb(234, 234, 234)` (unchanged); an inactive tab's background is unchanged (transparent) |
| 4 | FR-006 | The toolbar is strictly darker than the `.milkdown` canvas `rgb(255, 253, 251)` but still light (channel sum well below a pure white) |
| 5 | FR-005 | `.header-bar`, `.sidebar-panel`, `.app-footer`, and `.source-toolbar` backgrounds are unchanged from their `--ame-*` values (`rgb(248, 248, 250)` for the sidebar/source toolbar; `rgb(249, 249, 251)` for the header bar/status footer) |
| 6 | Dark (FR-007) | With the Theme set to Dark: `.milkdown-top-bar` equals `rgb(38, 38, 38)` (darker than the dark pill `rgb(45, 45, 45)`), `.header-bar` stays `rgb(31, 31, 31)`, and the editor canvas stays `rgb(31, 31, 31)` |
| 7 | No tabs | With no open document, `.header-bar` keeps its existing colour (the pill is absent) |

The suite launches with the shared `launch.ts` harness (`launchApp`, `openFolder`,
`openFile`, `openSettingsDialog`, `closeAppSafely`) and drives the theme switch
through the real settings dialog (as `theme.spec.ts` does).
