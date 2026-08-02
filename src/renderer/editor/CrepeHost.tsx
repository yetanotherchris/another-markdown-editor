import { useEffect, useRef } from 'react'
import type { Crepe } from '@milkdown/crepe'
import { CrepeFeature } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'

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
}

export default function CrepeHost({
  defaultValue,
  active,
  restoreCursor,
  onMarkdownUpdated,
  onReady,
  onBaselineCapture,
  onCursorState
}: CrepeHostProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Crepe | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const scrollElementRef = useRef<HTMLElement | null>(null)
  const wasActiveRef = useRef(active)

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
