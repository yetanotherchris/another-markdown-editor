import type { DesktopApi } from '../shared/ipc-contract'

declare global {
  interface Window {
    api: DesktopApi
  }
}

/** Vite `?raw` imports (spec 020: bundled Hunspell dictionary files). */
declare module '*?raw' {
  const content: string
  export default content
}

export {}
