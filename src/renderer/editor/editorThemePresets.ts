import type { EditorThemeName, EditorColors } from '../../shared/ipc-contract'

/**
 * Spec 023 (FR-003/004/007): the canonical colours + font of the five editor
 * theme presets (spec 016), extracted from `editor/themes.css`, and the pure
 * detection that decides whether a stored configuration matches a preset or is
 * a Custom theme.
 */

export type EditorFont = 'serif' | 'sans-serif'

export interface EditorPreset {
  name: EditorThemeName
  /** The preset's font family choice (FR-002/FR-008). */
  font: EditorFont
  /** The preset's six curated colour tokens (contracts/editor-theme.md). */
  colors: EditorColors
}

const RUSTIC_COLORS: EditorColors = {
  background: '#fdf6e3',
  foreground: '#1f1b16',
  accent: '#805610',
  surface: '#fdf3d9',
  outline: '#817567',
  code: '#ba1a1a'
}

const SCHOLARLY_COLORS: EditorColors = {
  background: '#ffffff',
  foreground: '#1a1a1a',
  accent: '#00b0e9',
  surface: '#f7f7f7',
  outline: '#8a8a8a',
  code: '#b50000'
}

const MONOTONE_LIGHT: EditorColors = {
  background: '#ffffff',
  foreground: '#000000',
  accent: '#000000',
  surface: '#ffffff',
  outline: '#808080',
  code: '#000000'
}

const MONOTONE_DARK: EditorColors = {
  background: '#000000',
  foreground: '#ffffff',
  accent: '#ffffff',
  surface: '#000000',
  outline: '#808080',
  code: '#ffffff'
}

/** The two-tone monotone palettes, keyed by the resolved app theme (spec 016:
 *  Monotone follows `data-theme` live). */
export const MONOTONE_COLORS: Record<'light' | 'dark', EditorColors> = {
  light: MONOTONE_LIGHT,
  dark: MONOTONE_DARK
}

/** The presets that do not follow the app theme. Monotone presets are matched
 *  per-app-theme-variant (see matchPreset). */
const STATIC_PRESETS: EditorPreset[] = [
  { name: 'rustic', font: 'sans-serif', colors: RUSTIC_COLORS },
  { name: 'rustic-serif', font: 'serif', colors: RUSTIC_COLORS },
  { name: 'scholarly', font: 'sans-serif', colors: SCHOLARLY_COLORS }
]

const MONOTONE_PRESETS: { name: EditorThemeName; font: EditorFont }[] = [
  { name: 'monotone', font: 'sans-serif' },
  { name: 'monotone-serif', font: 'serif' }
]

/** True when `colors` equals every token of `presetColors`. */
function colorsMatch(a: EditorColors, b: EditorColors): boolean {
  return (Object.keys(a) as (keyof EditorColors)[]).every((k) => a[k].toLowerCase() === b[k].toLowerCase())
}

export type ResolvedEditorTheme =
  | { kind: 'preset'; name: EditorThemeName }
  | { kind: 'custom' }

export interface ResolveInput {
  /** The stored `editorTheme` preset name (ignored when custom colours exist). */
  editorTheme: EditorThemeName
  /** The stored `editorFont` typeface. */
  editorFont: EditorFont
  /** Custom colour overrides, or null (preset colours in effect). */
  editorColors: EditorColors | null
  /** The resolved app theme mode (spec 013) — used for monotone matching. */
  appMode: 'light' | 'dark'
}

/** Decide whether the stored colours + font match a preset exactly (FR-003/004/
 *  007). With no custom colours the stored preset name stands (backward
 *  compatibility, SC-005). Monotone presets match against the current app-theme
 *  variant. */
export function resolveEditorTheme(input: ResolveInput): ResolvedEditorTheme {
  if (input.editorColors === null) {
    return { kind: 'preset', name: input.editorTheme }
  }

  for (const preset of STATIC_PRESETS) {
    if (colorsMatch(preset.colors, input.editorColors) && preset.font === input.editorFont) {
      return { kind: 'preset', name: preset.name }
    }
  }

  const monotoneColors = MONOTONE_COLORS[input.appMode]
  for (const preset of MONOTONE_PRESETS) {
    if (colorsMatch(monotoneColors, input.editorColors) && preset.font === input.editorFont) {
      return { kind: 'preset', name: preset.name }
    }
  }

  return { kind: 'custom' }
}

const SANS_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', sans-serif"
const SERIF_STACK = "Georgia, 'Times New Roman', 'Noto Serif', serif"

/** The font stack for an `editorFont` choice, matching `themes.css` (FR-008). */
export function fontStackFor(font: EditorFont): string {
  return font === 'serif' ? SERIF_STACK : SANS_STACK
}
