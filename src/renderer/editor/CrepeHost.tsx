import { useEffect, useRef } from 'react'
import type { Crepe } from '@milkdown/crepe'
import { CrepeFeature } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { applyToolbarLabels } from './toolbarLabels'
import { planTaskBackspace } from './taskBackspace'

export interface CursorState {
  cursorOffset: number
  scrollTop: number
}

interface CrepeHostProps {
  defaultValue: string
  active: boolean
  restoreCursor?: CursorState
  onMarkdownUpdated: (markdown: string) => void
  onReady: (editor: Crepe) => void
  onBaselineCapture: (markdown: string) => void
  onCursorState: (cursor: CursorState) => void
  onRequestViewSource: () => void
}

const VIEW_SOURCE_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M9.4 16.6 4.8 12l4.6-4.6 1.4 1.4-3.2 3.2 3.2 3.2Zm5.2 0L19.2 12l-4.6-4.6-1.4 1.4 3.2 3.2-3.2 3.2Z" />
  </svg>
`

export default function CrepeHost({
  defaultValue,
  active,
  restoreCursor,
  onMarkdownUpdated,
  onReady,
  onBaselineCapture,
  onCursorState,
  onRequestViewSource
}: CrepeHostProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Crepe | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const scrollElementRef = useRef<HTMLElement | null>(null)
  const wasActiveRef = useRef(active)
  const onViewSourceRef = useRef(onRequestViewSource)
  onViewSourceRef.current = onRequestViewSource

  function applyCursorState(view: EditorView | null) {
    if (!view || !restoreCursor) return
    const { cursorOffset, scrollTop } = restoreCursor
    if (cursorOffset > 0) {
      const pos = Math.min(cursorOffset, view.state.doc.content.size)
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
    }
    if (scrollTop > 0 && scrollElementRef.current) {
      scrollElementRef.current.scrollTop = scrollTop
    }
  }

  function captureCursorState(): CursorState {
    const view = viewRef.current
    const scrollElement = scrollElementRef.current
    return {
      cursorOffset: view ? view.state.selection.anchor : 0,
      scrollTop: scrollElement ? scrollElement.scrollTop : 0
    }
  }

  useEffect(() => {
    let mounted = true

    async function init() {
      const { Crepe: CrepeClass } = await import('@milkdown/crepe')
      const crepe = new CrepeClass({
        root: containerRef.current!,
        defaultValue,
        features: {
          // A persistent menu bar (headings + formatting buttons) replaces the
          // floating toolbar that pops up on selection, and the per-line
          // block-edit "+" handle.
          [CrepeFeature.Toolbar]: false,
          [CrepeFeature.BlockEdit]: false,
          [CrepeFeature.TopBar]: true
        },
        featureConfigs: {
          [CrepeFeature.TopBar]: {
            // Spec 002: a "View source" button appended to the top bar. Crepe
            // invokes buildTopBar after composing its default groups, so the
            // extra group renders last (research.md R7).
            buildTopBar(builder) {
              builder
                .addGroup('view', 'View')
                .addItem('view-source', {
                  icon: VIEW_SOURCE_ICON,
                  active: () => false,
                  onRun: () => {
                    onViewSourceRef.current()
                  }
                })
            }
          }
        }
      })

      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          if (mounted) {
            onMarkdownUpdated(markdown)
          }
        })
      })

      await crepe.create()
      if (!mounted) {
        crepe.destroy()
        return
      }
      editorRef.current = crepe
      const view = crepe.editor.action((ctx) => ctx.get(editorViewCtx))
      viewRef.current = view
      scrollElementRef.current = view.dom.closest('.editor-host') ?? view.dom.parentElement
      onReady(crepe)
      // Spec 002, US5 (FR-016/017): Backspace at the start of an empty task
      // item removes it — intercepted here so ProseMirror never gets a shot at
      // producing an undeletable checkbox. Everything else falls through.
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Backspace') return
        const tr = planTaskBackspace(view.state)
        if (!tr) return
        event.preventDefault()
        event.stopPropagation()
        view.dispatch(tr)
      }
      view.dom.addEventListener('keydown', onKeyDown)
      // Spec 002: Crepe's TopBar renders controls with no title/aria-label;
      // assign them by DOM order now that the tree exists (toolbarLabels.ts).
      const topBar = containerRef.current?.querySelector<HTMLElement>('.milkdown-top-bar')
      if (topBar) applyToolbarLabels(topBar)
      // The listener plugin only emits markdownUpdated on the first *edit*
      // (its handler is debounced by 200 ms and no doc-changing transaction
      // fires on load), so the baseline cannot come from the first emission.
      // Reading the freshly parsed content directly is the reliable source
      // (research.md R4, verified in Phase 5).
      onBaselineCapture(crepe.getMarkdown())
      if (active) {
        applyCursorState(view)
        view.focus()
      }
    }

    init()

    return () => {
      mounted = false
      editorRef.current?.destroy()
      editorRef.current = null
      viewRef.current = null
      scrollElementRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (active) {
      applyCursorState(view)
      view.focus()
    } else if (wasActiveRef.current) {
      onCursorState(captureCursorState())
    }
    wasActiveRef.current = active
  }, [active])

  return <div ref={containerRef} />
}
