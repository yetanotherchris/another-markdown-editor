import type { Settings } from '../../shared/ipc-contract'

const defaults: Settings = {
  sidebarWidth: 30,
  themeOverride: null,
  explorerVisible: true,
  editorFont: 'sans-serif',
  editorTheme: 'rustic',
  spellcheckEnabled: true
}

let cached: Settings = { ...defaults }

export function getSettings(): Settings {
  return cached
}

export function updateSettings(patch: Partial<Settings>): void {
  cached = { ...cached, ...patch }
}

export async function loadSettingsFromMain(): Promise<void> {
  const result = await window.api.getSettings()
  if (result.ok) {
    cached = { ...defaults, ...result.value }
  }
}
