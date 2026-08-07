import type { EditorThemeName } from '../../shared/ipc-contract'

/**
 * Spec 016 (FR-001): the five named editor themes, in dialog display order. The
 * single source of truth shared by the settings dialog and the unit test — the
 * theme's *values* live in renderer CSS (editor/themes.css), never here or in
 * the config (FR-005).
 */
export const EDITOR_THEMES: { value: EditorThemeName; label: string }[] = [
  { value: 'rustic', label: 'Rustic' },
  { value: 'rustic-serif', label: 'Rustic Serif' },
  { value: 'monotone', label: 'Monotone' },
  { value: 'monotone-serif', label: 'Monotone Serif' },
  { value: 'scholarly', label: 'Scholarly' }
]
