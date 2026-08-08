import { useEffect, useRef } from 'react'
import type { Crepe } from '@milkdown/crepe'
import { CrepeFeature } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import { $prose } from '@milkdown/kit/utils'
import { TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { applyToolbarLabels } from './toolbarLabels'
import { planTaskBackspace } from './taskBackspace'
import { tightListPlugins } from './tightList'
import { spellcheckPlugin, type SpellingMenuState } from './spellcheckPlugin'

export interface CursorState {
  cursorOffset: number
  scrollTop: number
}

interface CrepeHostProps {
  defaultValue: string
  active: boolean
  /** True while this tab shows the source overlay. Editor-originated
   *  markdownUpdated emissions are suppressed (their 200 ms debounce could
   *  otherwise clobber raw source edits) and the covered editor is made
   *  inert so it leaves the keyboard and accessibility tree (FR-009). */
  locked: boolean
  /** Spec 020 (JS spellchecker): called with the right-click correction menu
   *  (or `null` to dismiss). Owned by the spellcheck plugin. */
  onSpellingMenu: (menu: SpellingMenuState | null) => void
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
  locked,
  onSpellingMenu,
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
  const lockedRef = useRef(locked)
  lockedRef.current = locked
  const onSpellingMenuRef = useRef(onSpellingMenu)
  onSpellingMenuRef.current = onSpellingMenu

  // While the source overlay covers this editor, make the ProseMirror
  // contenteditable and the Crepe top bar non-focusable (inert) so Tab/AT
  // users do not walk through invisible, covered controls behind it (FR-009).
  // The source textarea is NOT inside this path and stays fully interactive.
  function applyInert() {
    const onInert = lockedRef.current
    const view = viewRef.current
    if (view) view.dom.toggleAttribute('inert', onInert)
    containerRef.current
      ?.querySelectorAll('.milkdown-top-bar')
      .forEach((bar) => bar.toggleAttribute('inert', onInert))
  }

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
      if (!mounted || !containerRef.current) return
      const crepe = new CrepeClass({
        root: containerRef.current,
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
              builder.addGroup('view', 'View').addItem('view-source', {
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
          // Drop emissions while the tab is in source view: the listener's
          // 200 ms debounce-outstanding changes is not the store's state, so a
          // late emission from a superseded edit must not overwrite the raw
          // text the user is typing (research R3, 2026-08-02 data-loss fix).
          if (mounted && !lockedRef.current) {
            onMarkdownUpdated(markdown)
          }
        })
      })

      // Tight/loose list serialization fix (tightList.ts): milkdown's default
      // bullet_list/list_item runners pass the `spread` attr through as a
      // string, which remark's stringifier treats as truthy and serializes as
      // a LOOSE list (blank lines between items). These overrides coerce it to
      // a real boolean so tight lists round-trip tight; genuinely loose lists
      // stay loose. Task-item handling is preserved via gfm's extension.
      tightListPlugins.forEach((plugin) => crepe.editor.use(plugin))

      // Spec 020 (JS spellchecker): whole-document checking + the correction
      // menu. The wrapper reads the latest onSpellingMenu prop via the ref.
      crepe.editor.use($prose(() => spellcheckPlugin((menu) => onSpellingMenuRef.current(menu))))

      try {
        await crepe.create()
      } catch (error) {
        if (mounted) console.error('Editor initialization failed', error)
        crepe.destroy()
        return
      }
      if (!mounted) {
        crepe.destroy()
        return
      }
      editorRef.current = crepe
      const view = crepe.editor.action((ctx) => ctx.get(editorViewCtx))
      viewRef.current = view
      scrollElementRef.current = view.dom.closest('.editor-host') ?? view.dom.parentElement
      // Spec 020 (2026-08-07): the JS spellchecker marks misspellings itself,
      // so Chromium's native markers are switched OFF here to avoid double
      // underlines. The source view keeps native spellchecking (FR-007).
      view.dom.spellcheck = false
      onReady(crepe)
      // Spec 002, US5 (FR-016/017): Backspace at the start of an empty task
      // item removes it. Bound on `view.dom` in the CAPTURE phase so this runs
      // before ProseMirror's own keydown handler registers the key (the editor
      // attaches its listener during crepe.create(), earlier than this one);
      // when the keystroke is handled, stopImmediatePropagation ensures the
      // editor never produces its own join transaction. Everything else falls
      // through (FR-018).
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Backspace') return
        const tr = planTaskBackspace(view.state)
        if (!tr) return
        event.preventDefault()
        event.stopImmediatePropagation()
        view.dispatch(tr)
      }
      view.dom.addEventListener('keydown', onKeyDown, true)
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
      applyInert()
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
    // Reflect view switches (formatted → source / source → formatted) onto the
    // cover-locked elements without remounting the editor.
    applyInert()
  }, [locked])

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
