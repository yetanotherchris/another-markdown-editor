import { useCallback, useRef } from 'react'
import { updateSettings } from '../state/settings'

export interface SidebarLayoutApi {
  handleSidebarResize: (size: { asPercentage: number; inPixels: number }) => void
  handleToggleExplorer: () => void
}

interface SidebarPanelLike {
  isCollapsed(): boolean
  expand(): void
  collapse(): void
}

/**
 * Sidebar layout (US1/FR-002, spec 010): explorer visibility + width
 * persistence. The never-persist-a-0-width rule, the mount guard against the
 * transient size-0, and the explicit-visibility persistence live here.
 */
export function useSidebarLayout(opts: {
  sidebarPanelRef: { current: SidebarPanelLike | null }
  explorerRestoreDoneRef: React.MutableRefObject<boolean>
  setExplorerCollapsed: (collapsed: boolean) => void
}): SidebarLayoutApi {
  const { sidebarPanelRef, explorerRestoreDoneRef, setExplorerCollapsed } = opts
  const expandingRef = useRef(false)
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSidebarResize = useCallback(
    (size: { asPercentage: number; inPixels: number }) => {
      const collapsed = size.asPercentage <= 0
      if (collapsed && expandingRef.current) return
      if (!collapsed) {
        if (expandTimerRef.current) clearTimeout(expandTimerRef.current)
        expandTimerRef.current = setTimeout(() => {
          expandingRef.current = false
          expandTimerRef.current = null
        }, 1000)
      }
      setExplorerCollapsed(collapsed)
      // Never persist a collapsed (0) width. Writing 0 would change the Panel's
      // `defaultSize` prop, which re-runs its registration effect and replaces
      // the panel object — wiping the library's `expandToSize` so a toggle-expand
      // snaps to minSize instead of the previous width (spec 010 US2 scenario 2,
      // verified 2026-08-05). The collapsed visibility is persisted separately.
      if (collapsed) {
        if (explorerRestoreDoneRef.current) {
          updateSettings({ explorerVisible: false })
          window.api.updateSettings({ explorerVisible: false }).catch(() => {
            /* ignore */
          })
        }
        return
      }
      updateSettings({ sidebarWidth: size.asPercentage })
      window.api.updateSettings({ sidebarWidth: size.asPercentage }).catch(() => {
        /* ignore */
      })
      // A non-collapsed panel IS visible, so persist true unconditionally. Main's
      // settings merge reads the CURRENT state from disk, so two updates inside
      // the 500 ms debounce window clobber each other (the sidebarWidth-only
      // write above would otherwise resurrect a stale persisted "hidden" choice —
      // the exact race that broke the reveal-on-open restart e2e, review
      // 2026-08-06). The launch-time restore was removed the same day; the mount
      // guard above still suppresses the transient size-0 from persisting a fake
      // collapse.
      updateSettings({ explorerVisible: true })
      window.api.updateSettings({ explorerVisible: true }).catch(() => {
        /* ignore */
      })
    },
    [expandTimerRef, explorerRestoreDoneRef, expandingRef, setExplorerCollapsed]
  )

  // Spec 010, US2: the explorer toggle collapses/expands the sidebar panel
  // (FR-005). The panel only exists while a workspace is open; the button is
  // disabled otherwise (spec edge case). The choice is persisted explicitly so
  // it does not depend on a resize event firing (FR-007).
  const handleToggleExplorer = useCallback(() => {
    const panel = sidebarPanelRef.current
    if (!panel) return
    explorerRestoreDoneRef.current = true
    // isCollapsed() is true when the panel IS collapsed: expand then, else
    // collapse, and persist the resulting state.
    const currentlyCollapsed = panel.isCollapsed()
    if (currentlyCollapsed) {
      expandingRef.current = true
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current)
      panel.expand()
    } else {
      panel.collapse()
    }
    updateSettings({ explorerVisible: !currentlyCollapsed })
    window.api.updateSettings({ explorerVisible: !currentlyCollapsed }).catch(() => {
      /* ignore */
    })
  }, [expandTimerRef, expandingRef, explorerRestoreDoneRef, sidebarPanelRef])

  return { handleSidebarResize, handleToggleExplorer }
}
