# Data Model: Modern Grey UI

Types and state affected by `010-modern-grey-ui`.

## Settings (persisted)

`src/shared/ipc-contract.ts` — `Settings` gains one field:

```ts
export interface Settings {
  sidebarWidth: number        // existing (30)
  themeOverride: 'light' | 'dark' | null   // existing — IGNORED by the chrome (out of scope)
  explorerVisible: boolean    // NEW — default true
}
```

- Main (`src/main/settings.ts`): `DEFAULTS.explorerVisible = true`;
  `loadSettings` validates `typeof parsed.explorerVisible === 'boolean'`
  (fallback to the default); `saveSettings` unchanged (writes the whole object).
- Renderer (`src/renderer/state/settings.ts`): default added to `defaults`; the
  `settings:get` merge already spreads main's value over the defaults.
- `settings:update` handler (`src/main/ipc/handlers.ts`): merge branch
  `explorerVisible: typeof p.explorerVisible === 'boolean' ? p.explorerVisible : current.explorerVisible`
  — the existing `sidebarWidth` pattern.

## Chrome state (component-local, not a reducer)

`App.tsx`:

```ts
const explorerVisible = getSettings().explorerVisible      // initial
const [explorerCollapsed, setExplorerCollapsed] = useState(!explorerVisible)
const explorerPanelRef = usePanelRef<PanelImperativeHandle>()
```

- `toggleExplorer()`: `explorerCollapsed ? explorerPanelRef.current?.expand() : explorerPanelRef.current?.collapse()`.
- `onResize(panelSize)`: `setExplorerCollapsed(panelSize.asPercentage <= 0)`;
  on any change persist `updateSettings({ explorerVisible: !collapsed })` +
  `window.api.updateSettings(...)` (the `handleSidebarResize` pair).
- Mount effect: if the loaded setting says hidden, `explorerPanelRef.current?.collapse()`.
- Rendered tree: `{hasWorkspace && (<><Panel collapsible collapsedSize={0} …/>
  {explorerCollapsed ? null : <Separator/>}</>)}`.

## Hamburger command model

One source of truth for the dropdown — an ordered item list rendered by
`HamburgerMenu` and (redundantly enforced) by the e2e item assertions:

```ts
type HamburgerAction =
  | { kind: 'command'; label: string; command: MenuCommand; accelerator?: string }
  | { kind: 'recent'; label: string }
  | { kind: 'action'; label: string; action: 'clear-recent' | 'toggle-devtools' | 'quit' }
  | { kind: 'separator' }
```

Order: `new-file`, `open-file`, `open-folder`, `recent` group, separator,
`save`, `save-as`, `close-tab`, separator, `toggle-devtools`, separator, `quit`.

`App.tsx` extracts the body of the current `onMenuCommand` listener into
`handleMenuCommand(command: MenuCommand)`; the hamburger's `onCommand` prop and
the IPC listener both call it. `open-recent` (from the hamburger) resolves to
`window.api.openRecentFile(path)` (files) or `runFolderOpenFlow(path)` (folders).

## TabBar props

```ts
interface TabBarProps {
  documents: DocumentState[]
  activeId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void        // NEW — "+" button
}
```

- `documents.length === 0` ⇒ render the strip with only the "+" button (spec
  edge: "+" stays present without a workspace).
- Otherwise render tabs in order, inserting the "+" immediately after the
  active tab's DOM node (FR-004 literal).

## Aria contract (e2e anchors)

| Control | Element | Accessible name |
|---------|---------|-----------------|
| Hamburger trigger | `button` | `Open menu` (`aria-label`), `aria-haspopup="menu"`, `aria-expanded` |
| Explorer toggle | `button` | `Toggle file explorer` |
| "+" new-file | `button` | `New file` |
| Tab close | `button` | `Close <title>` (existing) |
| Active-tab edit indicator | `svg` (decorative) | none (aria-hidden) |
| Hamburger items | `button[role="menuitem"]` | item labels |
