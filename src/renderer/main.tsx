import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/400-italic.css'
import '@milkdown/crepe/theme/classic.css'
import '@milkdown/crepe/theme/common/style.css'
import App from './App'
import { loadSettingsFromMain } from './state/settings'

// Spec 013: resolve the persisted settings (theme, font, explorer visibility)
// BEFORE the first render, so the initial paint already applies them — a
// persisted dark theme never flashes light (the renderer reads the cache
// synchronously in useState initialisers). The IPC round trip is a few ms and
// the window shows on `ready-to-show`, so the shell does not visibly wait.
async function start(): Promise<void> {
  await loadSettingsFromMain()
  const root = document.getElementById('root')
  if (root) {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  }
}

void start()
