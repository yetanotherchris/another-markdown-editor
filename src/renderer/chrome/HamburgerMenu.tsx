import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Bars3Icon, ChevronRightIcon } from '@heroicons/react/24/outline'
import type { MenuCommand, RecentItem } from '../../shared/ipc-contract'
import { hamburgerMenuStructure, recentMenuEntries } from './menuModel'
import type { Platform, HamburgerItem } from './menuModel'

/** The sandboxed renderer exposes a minimal `process` with `platform`. */
function currentPlatform(): Platform {
  const p = (globalThis as { process?: { platform?: string } }).process?.platform
  return p === 'darwin' || p === 'linux' ? p : 'win32'
}

interface HamburgerMenuProps {
  /** The shared renderer command bus (handleMenuCommand in App.tsx). */
  onCommand: (command: MenuCommand) => void
  /** Spec 012 FR-001: open the settings dialog from the "main menu" (the
   *  hamburger replaced the native menu in spec 010). */
  onOpenSettings: () => void
}

/**
 * Spec 010 (FR-001/002/004, US4): the React hamburger dropdown that replaces the
 * native menu bar. A React UI (user decision 2026-08-05), not an OS-native
 * `Menu.popup()`. Real `<button role="menuitem">` rows for keyboard access
 * (FR-009); closes on outside click and Escape (US4 scenario 2).
 */
export default function HamburgerMenu({ onCommand, onOpenSettings }: HamburgerMenuProps) {
  const [open, setOpen] = useState(false)
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  // True once the most recent getRecentItems() resolved. The submenu renders
  // only after the load so it never flashes a stale "No Recent Items" and the
  // DOM deterministically reflects the loaded history (e2e reads it directly).
  const [recentLoaded, setRecentLoaded] = useState(false)
  // True when the most recent load FAILED (e.g. FR-011: broken config). The
  // list is then unknown, so the Clear action must still be offered — "No
  // Recent Items" is reserved for a confirmed-empty history.
  const [recentError, setRecentError] = useState(false)
  // Whether the Recent Items submenu (a parent menuitem, like the native
  // `File > Recent Items`) is expanded. `submenuOpenRef` mirrors the state so
  // the click handler always reads the freshest value — hovering the parent
  // opens the submenu, and the click that follows must not see a stale
  // "closed" closure and toggle it shut (a hover→click race).
  const [submenuOpen, setSubmenuOpen] = useState(false)
  const submenuOpenRef = useRef(false)
  const setSubmenuOpenSync = useCallback((value: boolean) => {
    submenuOpenRef.current = value
    setSubmenuOpen(value)
  }, [])
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const submenuRef = useRef<HTMLDivElement>(null)
  const recentParentRef = useRef<HTMLButtonElement>(null)
  const structure = hamburgerMenuStructure(currentPlatform())

  const loadRecent = useCallback(() => {
    setRecentLoaded(false)
    setRecentError(false)
    window.api.getRecentItems().then((result) => {
      if (result.ok) setRecentItems(result.value)
      else setRecentError(true)
      setRecentLoaded(true)
    })
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setSubmenuOpenSync(false)
    triggerRef.current?.focus()
  }, [setSubmenuOpenSync])

  // Open the Recent Items submenu, refreshing the list first so it mirrors the
  // native menu's on-open rebuild (spec 004 FR-014, spec 010).
  const openRecentSubmenu = useCallback(() => {
    loadRecent()
    setSubmenuOpenSync(true)
  }, [loadRecent, setSubmenuOpenSync])

  const toggle = useCallback(() => {
    if (open) {
      setOpen(false)
      setSubmenuOpenSync(false)
    } else {
      // The fetch lives OUTSIDE the state updater: React StrictMode double-
      // invokes updaters in dev, which would fire two IPC requests per open.
      loadRecent()
      setOpen(true)
    }
  }, [open, loadRecent, setSubmenuOpenSync])

  // Outside click closes the dropdown (US4 scenario 2). The submenu must be
  // collapsed too (review 2026-08-06), else the next open auto-expands it.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setSubmenuOpenSync(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, setSubmenuOpenSync])

  // Escape closes the submenu first (focus returning to its parent item), then
  // the whole dropdown, then returns focus to the trigger (FR-009).
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (submenuOpen) {
          setSubmenuOpenSync(false)
          recentParentRef.current?.focus()
          return
        }
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, submenuOpen])

  // On open, move focus into the menu (FR-009).
  useEffect(() => {
    if (!open) return
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')
    first?.focus()
  }, [open])

  // When the Recent Items submenu opens, move focus into it (FR-009).
  useEffect(() => {
    if (!open || !submenuOpen) return
    const first = submenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')
    first?.focus()
  }, [open, submenuOpen])

  const handleSelect = useCallback((command: MenuCommand) => {
    onCommand(command)
    close()
  }, [close, onCommand])

  const handleAction = useCallback((action: 'clear-recent' | 'toggle-devtools' | 'settings' | 'quit') => {
    if (action === 'clear-recent') {
      void window.api.clearRecentItems().then(() => loadRecent())
    } else if (action === 'toggle-devtools') {
      void window.api.toggleDevTools()
    } else if (action === 'settings') {
      onOpenSettings()
    } else {
      void window.api.requestQuit()
    }
    close()
  }, [close, loadRecent, onOpenSettings])

  const recentEntries = recentMenuEntries(recentItems)

  const renderItem = (item: HamburgerItem, index: number) => {
    switch (item.kind) {
      case 'command':
        return (
          <button
            key={`${index}-${item.command}`}
            role="menuitem"
            className="menu-item"
            onClick={() => handleSelect(item.command)}
          >
            <span className="menu-item-label">{item.label}</span>
            {item.accelerator && (
              <span className="menu-item-accelerator" aria-hidden="true">{item.accelerator}</span>
            )}
          </button>
        )
      case 'recent-items':
        return (
          <div key={`${index}-recent`} className="submenu-anchor">
            <button
              ref={recentParentRef}
              role="menuitem"
              className="menu-item"
              aria-haspopup="menu"
              aria-expanded={submenuOpen}
              onClick={() => {
                // Open if closed. Hovering already opened it (onMouseEnter),
                // so a click is never a "close" — Escape and outside clicks
                // close, mirroring a native submenu parent.
                if (!submenuOpenRef.current) openRecentSubmenu()
              }}
              onMouseEnter={openRecentSubmenu}
            >
              <span className="menu-item-label">Recent Items</span>
              <ChevronRightIcon className="menu-item-chevron" aria-hidden="true" />
            </button>
            {submenuOpen && recentLoaded && (
              <div ref={submenuRef} className="hamburger-submenu" role="menu" aria-label="Recent Items">
                {recentEntries.length === 0 && !recentError ? (
                  <button role="menuitem" className="menu-item" disabled>
                    <span className="menu-item-label">No Recent Items</span>
                  </button>
                ) : (
                  <>
                    {recentEntries.map((entry, i) => {
                      const separatorBeforeFiles =
                        entry.item.kind === 'file' && i > 0 && recentEntries[i - 1].item.kind === 'folder'
                      return (
                        <Fragment key={`${entry.item.path}\u0000${entry.item.kind}`}>
                          {separatorBeforeFiles && <div role="separator" className="menu-separator" />}
                          <button
                            role="menuitem"
                            className="menu-item"
                            onClick={() =>
                              handleSelect({ type: 'open-recent', path: entry.item.path, kind: entry.item.kind })
                            }
                          >
                            <span className="menu-item-label">{entry.label}</span>
                          </button>
                        </Fragment>
                      )
                    })}
                    <div role="separator" className="menu-separator" />
                    <button role="menuitem" className="menu-item" onClick={() => handleAction('clear-recent')}>
                      <span className="menu-item-label">Clear Recent Items</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      case 'separator':
        return <div key={`${index}-sep`} role="separator" className="menu-separator" />
      case 'action':
        return (
          <button
            key={`${index}-${item.action}`}
            role="menuitem"
            className="menu-item"
            onClick={() => handleAction(item.action)}
          >
            <span className="menu-item-label">{item.label}</span>
          </button>
        )
    }
  }

  return (
    <div className="hamburger">
      <button
        ref={triggerRef}
        type="button"
        className="chrome-icon-button"
        aria-label="Open menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        title="Menu"
      >
        <Bars3Icon className="chrome-icon" aria-hidden="true" />
      </button>
      {open && (
        <div ref={menuRef} className="hamburger-menu" role="menu" aria-label="Application menu">
          {structure.map(renderItem)}
        </div>
      )}
    </div>
  )
}
