# Research: Custom Editor Theme

## R1 — Six curated colour tokens, validated as `#rrggbb`

**Decision**: `EditorColors = { background, foreground, accent, surface, outline, code }`
stored in `settings.editorColors` (nullable), mapped to
`--crepe-color-{background,on-background,primary,surface,outline,inline-code}`.

**Rationale**: these six tokens capture the visible identity of every preset
(the spec's "background, foreground, accent, etc.") and map 1:1 onto Crepe's
token system, so arbitrary custom values can be applied without new CSS. Each is
validated in main as a `#rrggbb` hex string (FR-010), keeping the closed-record
discipline the settings already follow.

**Alternatives considered**: storing the full ~16-token crepe surface (rejected —
bloats the config and the comparison for no visible gain); free-form CSS
(rejected — FR-010 requires validation).

## R2 — Pure preset table + theme-aware detection

**Decision**: `editorThemePresets.ts` holds each preset's six colours + font;
monotone presets carry light/dark variants keyed to the resolved app theme.
`resolveEditorTheme` returns a preset name only on an exact colours+font match.

**Rationale**: the values already exist in `editor/themes.css`; extracting them
into one TS table makes detection a pure, unit-testable function and keeps the
CSS as the single render source. Monotone is app-theme-dependent (spec 016), so
its comparison uses the current `data-theme` variant — matching the spec's "match
a preset" semantics for the theme the user is actually viewing.

**Alternatives considered**: string-comparing the config against the CSS
(rejected — untestable); a manual "preset/custom" flag (rejected — FR-007 forbids
a manual toggle).

## R3 — Custom application via inline token overrides

**Decision**: the app container's `data-editor-theme` is the effective preset
name or `'custom'`; for custom, the six tokens + font stack are set inline on the
container, where Crepe's `.milkdown` rules consume them by inheritance.

**Rationale**: `themes.css` scopes the preset values under
`.app-container[data-editor-theme='…'] .milkdown`; for a custom theme there is no
preset block, so inline custom-property declarations on the container reproduce
exactly the mechanism the presets use — no new stylesheet, and the monotone
`[data-theme]` selectors are naturally bypassed.

**Alternatives considered**: generating a `<style>` block per custom theme
(rejected — React style props are simpler and reactive); a new `custom` CSS block
with hardcoded variables (rejected — the whole point is arbitrary values).

## R4 — Settings dialog: display-only Custom, preset save clears overrides

**Decision**: the dialog shows a checked, disabled **Custom** radio when the
effective theme is custom; Save on a preset commits `editorTheme`, clears
`editorColors`, and writes the preset's font into `editorFont`.

**Rationale**: FR-003/004 require the dialog to display the true state, and the
Assumptions forbid selecting "Custom". Persisting the preset's font alongside
clearing overrides keeps `editorFont` (now active, FR-008) coherent with the
theme. Existing preset-selection tests keep passing because the Custom radio only
renders while a custom theme is effective.

**Alternatives considered**: a "Custom" option that is selectable (rejected — it
has no selectable meaning, Assumptions); deriving `editorFont` from the theme
without writing it (rejected — FR-002 requires the font stored explicitly).
