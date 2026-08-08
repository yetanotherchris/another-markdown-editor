# Implementation Plan: Custom Editor Theme

**Branch**: `023-custom-editor-theme` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-custom-editor-theme/spec.md`

## Summary

The editor theme becomes **value-driven**: the config stores individual color
properties plus a font type, and the application automatically detects whether
those values exactly match one of the five presets (spec 016) — showing the
preset name, or **Custom** when they do not (FR-001/002/003/004/007). Selecting
a preset in the settings dialog commits that preset's colors + font and clears
any custom overrides (FR-005); the previously inert `editorFont` becomes active
and controls the typeface (FR-008). Existing configs without custom colors keep
their exact current appearance (SC-005); invalid color values are rejected with
a fallback to Rustic (FR-009/010). There is no color-picker UI (Assumptions) —
custom themes arrive by editing the config file.

## Technical Context

**Language/Version**: TypeScript 5.8, strict: true, across main, preload and renderer.

**Primary Dependencies**: React 19, `@milkdown/crepe` 7.21.3 (theme tokens). No new dependencies.

**Storage**: `config.json` `settings` gains `editorColors` (a nullable record of
six curated hex colours) and uses the existing `editorFont` (`'serif' | 'sans-serif'`).

**Testing**: Vitest (preset detection pure functions); Playwright e2e (config-driven
custom theme → dialog shows Custom + canvas applies; preset save clears overrides).

**Target Platform**: Windows, macOS, Linux desktop.

**Project Type**: Desktop application (Electron), WYSIWYG markdown editor.

**Performance Goals**: none — detection is a six-entry comparison on settings load.

**Constraints**: The five presets are fixed (Assumptions); "Custom" is display-only
and not selectable (Assumptions); custom values arrive via the config file (no
picker UI); renderer CSS keeps owning preset *values* but the effective application
must work for arbitrary custom colours.

**Scale/Scope**: one contract type + validation, one pure detection module, the
settings-dialog display, the canvas application path, unit + e2e coverage.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Process Isolation Is Absolute | Renderer-only presentation + main-side settings validation; no IPC surface change | **PASS** |
| II. Every Path Is Untrusted | No path handling touched | **PASS** |
| III. Never Lose The User's Words | Presentation only; config writes stay atomic; invalid colours are rejected, never persisted | **PASS** |
| IV. Calm, Predictable Editing | Detection is O(1) on settings load; no keystroke-path work | **PASS** |
| V. Test What Can Corrupt Or Escape | Config validation (colour format) and the preset-detection matrix get unit tests; e2e covers custom application + preset override | **PASS** |

**Post-design re-check**: no principle is violated.

## Phase 1 Design decisions

**Curated colour set.** `EditorColors` is a closed record of six `--crepe-color-*`
tokens that capture the visible identity of every preset:
`{ background, foreground, accent, surface, outline, code }` → `--crepe-color-{background,on-background,primary,surface,outline,inline-code}`.
Validated in main: each value must be a `#rrggbb` hex string (FR-010). This is
the "etc." set from the spec — a future colour picker can extend it.

**Preset table + pure detection.** A new `editorThemePresets.ts` defines the five
presets' canonical colours + font (extracted from `editor/themes.css`); monotone
presets carry light/dark variants keyed to the resolved app theme. Pure
`resolveEditorTheme({ editorTheme, editorFont, editorColors, appMode })` returns
`{ kind: 'preset', name }` or `{ kind: 'custom' }`:
- `editorColors === null` → the stored `editorTheme` preset (backward compat, SC-005).
- otherwise → compare colours against each preset (monotone against the current
  app-mode variant) AND font; an exact match yields that preset, else Custom.
  `editorTheme` is ignored when custom colours are present (Edge Case).

**Application.** The container's `data-editor-theme` becomes the effective preset
name, or `'custom'`; for custom, the six `--crepe-color-*` vars and the
`--crepe-font-{default,title}` stack (from `editorFont`) are set inline on the
container so the existing Crepe token CSS applies arbitrary values.

**Settings dialog.** When the effective theme is Custom, a display-only **Custom**
radio is checked (not selectable, Assumptions). Selecting a preset and Save
persists `editorTheme = preset`, `editorColors = null`, and `editorFont` = the
preset's font (FR-005). The `editorFont` becomes active for custom themes (FR-008).

## Project Structure

### Documentation (this feature)

```text
specs/023-custom-editor-theme/
├── spec.md              # Requirements
├── plan.md              # This file
├── research.md          # R1…R4 decisions
├── data-model.md        # Editor Colors / Custom Theme entities
├── quickstart.md        # Manual verification script
├── contracts/
│   └── editor-theme.md  # editorColors schema + detection contract
└── tasks.md             # (/speckit.tasks)
```

### Source Code (repository root)

```text
src/shared/ipc-contract.ts              # EditorColors type + Settings.editorColors
src/main/settingsFile.ts                # editorColors validation (hex, closed keys)
src/renderer/editor/editorThemePresets.ts  # NEW: preset table + resolveEditorTheme + font stack
src/renderer/App.tsx                    # effective theme → data-editor-theme + inline custom vars
src/renderer/chrome/SettingsDialog.tsx  # "Custom" display option; preset save clears overrides
src/renderer/hooks/useSettingsState.ts  # effective theme plumbing + editorFont/editorColors
tests/main/settings.test.ts             # editorColors validation cases
tests/renderer/editorThemePresets.test.ts  # NEW: detection matrix
tests/e2e/editor-theme-custom.spec.ts   # NEW: config-driven custom theme
```

**Structure decision**: the preset table mirrors `editorThemes.ts` (which stays
the dialog's label list); detection is a pure module beside it.

## Phase status

- Phase 1: Foundational — contract + validation + preset table + detection
- Phase 2: US1+US4 — application path (data-editor-theme + inline custom vars)
- Phase 3: US2+US3 — settings dialog "Custom" display + preset-save override
- Phase 4: Verification — unit + e2e
- Phase 5: Polish — gates, spec archive, status table

## Deferred / later features

- A colour-picker UI (spec Assumptions: explicitly future work)
- More presets (fixed at five, Assumptions)
- Non-hex colour formats / alpha

## Complexity tracking

None — no principle violated; the custom application reuses Crepe's token CSS.
