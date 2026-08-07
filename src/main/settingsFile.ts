import * as fs from 'fs'
import * as path from 'path'
import type { Settings, EditorThemeName } from '../shared/ipc-contract'
import { atomicWrite } from './fs/atomicWrite'

/**
 * Pure, electron-free settings store (spec 010 T003/T004, spec 012 T003) —
 * mirrors the `recentItems`/`recentItemsPath` split so the load/save logic is
 * unit-testable without mocking Electron. Callers resolve the file path
 * (settings.ts) and pass it in; this module never touches `app`.
 *
 * Spec 012 FR-002: settings live in the SAME per-user configuration file as the
 * recent-items list — `config.json` at `appData/ame` (or the `AME_CONFIG_DIR`
 * test seam). The file shape is `{ recentItems?, settings? }`, and every write
 * is a read-modify-write so saving settings never clobbers the recent-items
 * list (and vice versa).
 *
 * Tolerance (FR-009, spec edges): a missing, unreadable, or malformed settings
 * file yields the defaults (never an exception). Each field is validated
 * individually so a partially-corrupt file keeps every recoverable value.
 */
export const DEFAULTS: Settings = {
  sidebarWidth: 30,
  themeOverride: null,
  explorerVisible: true,
  editorFont: 'sans-serif',
  editorTheme: 'rustic'
}

/** Read the whole shared config file, tolerantly: `{}` when missing or invalid.
 *  `settings` extracts only the `.settings` section. */
export function readConfigFile(filePath: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** The closed five-name union of editor themes (spec 016 FR-001/FR-006). */
const EDITOR_THEME_NAMES: readonly EditorThemeName[] = [
  'rustic', 'rustic-serif', 'monotone', 'monotone-serif', 'scholarly'
]

function isEditorThemeName(value: unknown): value is EditorThemeName {
  return typeof value === 'string' && (EDITOR_THEME_NAMES as readonly string[]).includes(value)
}

function validateSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS }
  const parsed = raw as Record<string, unknown>
  return {
    sidebarWidth: typeof parsed.sidebarWidth === 'number' && Number.isFinite(parsed.sidebarWidth)
      ? parsed.sidebarWidth : DEFAULTS.sidebarWidth,
    themeOverride: (parsed.themeOverride === 'light' || parsed.themeOverride === 'dark' || parsed.themeOverride === null)
      ? parsed.themeOverride : DEFAULTS.themeOverride,
    explorerVisible: typeof parsed.explorerVisible === 'boolean' ? parsed.explorerVisible : DEFAULTS.explorerVisible,
    editorFont: (parsed.editorFont === 'sans-serif' || parsed.editorFont === 'serif')
      ? parsed.editorFont : DEFAULTS.editorFont,
    editorTheme: isEditorThemeName(parsed.editorTheme) ? parsed.editorTheme : DEFAULTS.editorTheme
  }
}

/**
 * Merge a renderer-supplied patch into `current`, validating every field
 * against a closed set (review #27: `editorFont` is a closed union — never
 * arbitrary text; `sidebarWidth` must be a finite number). Returns the merged
 * Settings. Pure and electron-free so the merge is unit-testable; `settings.ts`
 * holds the authoritative in-memory snapshot this is applied to.
 */
export function mergeSettingsPatch(current: Settings, patch: Partial<Settings>): Settings {
  return {
    sidebarWidth: typeof patch.sidebarWidth === 'number' && Number.isFinite(patch.sidebarWidth)
      ? patch.sidebarWidth : current.sidebarWidth,
    themeOverride: patch.themeOverride === 'light' || patch.themeOverride === 'dark' || patch.themeOverride === null
      ? patch.themeOverride as 'light' | 'dark' | null
      : current.themeOverride,
    explorerVisible: typeof patch.explorerVisible === 'boolean' ? patch.explorerVisible : current.explorerVisible,
    editorFont: patch.editorFont === 'sans-serif' || patch.editorFont === 'serif'
      ? patch.editorFont as 'sans-serif' | 'serif'
      : current.editorFont,
    editorTheme: isEditorThemeName(patch.editorTheme) ? patch.editorTheme : current.editorTheme
  }
}

export function loadSettingsFile(filePath: string): Settings {
  return validateSettings(readConfigFile(filePath).settings)
}

/** True when the config file has a `.settings` key — lets the caller decide
 *  whether a legacy migration applies (settings.ts). */
export function hasSettingsKey(filePath: string): boolean {
  return 'settings' in readConfigFile(filePath)
}

/**
 * One-time migration (spec 012, plan decision), electron-free: when `configPath`
 * has no `.settings` key yet and `legacyPath` holds a pre-012 flat Settings
 * object, import its values into `configPath`. Returns the migrated Settings, or
 * `null` when no migration applies. Best-effort — a read/write failure returns
 * `null` and the caller falls through to the defaults (FR-009). The caller
 * resolves both paths (settings.ts); this module never touches `app`.
 */
export function migrateLegacySettingsFile(configPath: string, legacyPath: string): Settings | null {
  if (hasSettingsKey(configPath) || configPath === legacyPath) return null
  const legacy = readConfigFile(legacyPath)
  // Gate on "a non-empty object carrying at least one known Settings key", not
  // on any single field (review #27 #7): a hand-edited or partially-written
  // legacy file with, say, only `themeOverride` should still be imported rather
  // than dropped whole. validateSettings recovers every field individually.
  if (!legacy || typeof legacy !== 'object') return null
  const known: (keyof Settings)[] = ['sidebarWidth', 'themeOverride', 'explorerVisible', 'editorFont', 'editorTheme']
  if (!known.some((k) => k in legacy)) return null
  const migrated = validateSettings(legacy)
  try {
    writeSettingsFile(configPath, migrated)
  } catch {
    return null
  }
  return migrated
}

/**
 * Read-modify-write: load the current config (tolerant → `{}`), merge the
 * `settings` section, and write the whole file back so `recentItems` survives.
 *
 * The write is ATOMIC (temp + fsync + rename, Principle III) with an explicit
 * `0o600` mode — review #27 M1/M2: settings now share the file that holds the
 * MRU list of absolute paths, so this writer must not be able to truncate it on
 * a crash (a plain `writeFileSync` could) or leave it world-readable on first
 * creation (the `ame` directory may not exist yet on a fresh profile).
 */
export function writeSettingsFile(filePath: string, settings: Settings): void {
  const current = readConfigFile(filePath)
  const updated = { ...current, settings }
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  atomicWrite(filePath, JSON.stringify(updated, null, 2), 0o600)
}
