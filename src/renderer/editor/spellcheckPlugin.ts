import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { findMisspellings } from '../domain/spellcheck'
import { spellcheckRuntime, updateSpellcheckRuntime, onSpellcheckRuntimeChange } from './spellcheckRuntime'

/**
 * Spec 020 (2026-08-07): the JS whole-document spellchecker as a ProseMirror
 * plugin. Marks misspelled ranges with the `ame-spelling-error` inline
 * decoration (wavy-red underline in CSS) and owns the right-click correction
 * menu (suggestions from nspell + add-to-dictionary).
 *
 * The check runs on open (the whole document) and, debounced, after each edit.
 * Code blocks are skipped (spec edge case: code regions are not spellchecked).
 */

export interface SpellingMenuState {
  x: number
  y: number
  word: string
  suggestions: string[]
  /** Replace the misspelled word with `replacement`. */
  apply: (replacement: string) => void
  /** Teach the word to the user dictionary and persist it. */
  addToDictionary: () => void
}

interface SpellcheckPluginState {
  decos: DecorationSet
}

export const spellcheckKey = new PluginKey<SpellcheckPluginState>('ame-spellcheck')

const RECOMPUTE_DEBOUNCE_MS = 120
const MAX_SUGGESTIONS = 5

/** Nodes whose text is never spellchecked (code regions, formulas). */
function isSkippedNode(node: PMNode): boolean {
  const name = node.type.name
  return name === 'code_block' || name === 'fence' || name === 'math'
}

/** Every spellcheckable text segment with its absolute doc offsets. */
function collectTextSegments(doc: PMNode): Array<{ from: number; to: number; text: string }> {
  const segments: Array<{ from: number; to: number; text: string }> = []
  doc.descendants((node, pos) => {
    if (node.isText) {
      segments.push({ from: pos, to: pos + node.nodeSize, text: node.text ?? '' })
      return false
    }
    return !isSkippedNode(node)
  })
  return segments
}

/** Build the decoration set for the whole document. */
export function computeSpellcheckDecorations(view: EditorView): DecorationSet {
  const runtime = spellcheckRuntime
  if (!runtime.enabled) return DecorationSet.empty

  const decorations: Decoration[] = []
  for (const segment of collectTextSegments(view.state.doc)) {
    for (const misspelling of findMisspellings(segment.text, runtime.checker, runtime.customWords)) {
      decorations.push(
        Decoration.inline(segment.from + misspelling.start, segment.from + misspelling.end, {
          class: 'ame-spelling-error'
        })
      )
    }
  }
  return DecorationSet.create(view.state.doc, decorations)
}

/** Dispatch a fresh decoration set onto the view (idempotent, no doc change). */
function applyDecorations(view: EditorView): void {
  if (view.state.doc === undefined) return
  const decos = computeSpellcheckDecorations(view)
  view.dispatch(view.state.tr.setMeta(spellcheckKey, { decos }))
}

/**
 * Create the plugin. `onMenu` is invoked with a correction menu (or `null` to
 * dismiss); it is the plugin's only way out of the editor, so callers should
 * pass a stable wrapper that reads the latest prop from a ref.
 */
export function spellcheckPlugin(onMenu: (menu: SpellingMenuState | null) => void): Plugin {
  return new Plugin<SpellcheckPluginState>({
    key: spellcheckKey,

    state: {
      init() {
        return { decos: DecorationSet.empty }
      },
      apply(tr, value) {
        const meta = tr.getMeta(spellcheckKey)
        return meta ? { decos: meta.decos } : value
      }
    },

    props: {
      decorations(state) {
        return spellcheckKey.getState(state)?.decos ?? DecorationSet.empty
      },

      handleDOMEvents: {
        contextmenu(view, event) {
          return handleContextMenu(view, event, onMenu)
        }
      }
    },

    view(view) {
      let timer: ReturnType<typeof setTimeout> | null = null
      let destroyed = false
      let lastVersion = spellcheckRuntime.version

      const schedule = () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          if (!destroyed) applyDecorations(view)
        }, RECOMPUTE_DEBOUNCE_MS)
      }

      // Initial pass: the whole document, right after the editor mounts.
      schedule()

      // Re-check immediately when settings/custom-words change (no doc change).
      const unsubscribeRuntime = onSpellcheckRuntimeChange(schedule)

      return {
        update(view, prevState) {
          if (view.state.doc !== prevState.doc || spellcheckRuntime.version !== lastVersion) {
            lastVersion = spellcheckRuntime.version
            schedule()
          }
        },
        destroy() {
          destroyed = true
          unsubscribeRuntime()
          if (timer) clearTimeout(timer)
        }
      }
    }
  })
}

/** Open the correction menu when the right-click lands on a marked word. */
function handleContextMenu(
  view: EditorView,
  event: MouseEvent,
  onMenu: (menu: SpellingMenuState | null) => void
): boolean {
  const runtime = spellcheckRuntime
  if (!runtime.enabled) return false

  const target = event.target as HTMLElement | null
  if (!target || !(target instanceof Element)) return false
  const span = target.closest('.ame-spelling-error') as HTMLElement | null
  if (!span) {
    // Not on a misspelled word: dismiss any open menu, let the default pass.
    onMenu(null)
    return false
  }

  // The decorated span wraps exactly the misspelled word (inline decoration),
  // so its DOM offsets map straight to the doc range.
  const from = view.posAtDOM(span, 0)
  const to = view.posAtDOM(span, span.childNodes.length)
  if (from < 0 || to <= from) return false

  const word = view.state.doc.textBetween(from, to)
  if (!word) return false

  const suggestions = runtime.checker.suggest(word).slice(0, MAX_SUGGESTIONS)

  event.preventDefault()
  onMenu({
    x: event.clientX,
    y: event.clientY,
    word,
    suggestions,
    apply: (replacement) => {
      view.dispatch(view.state.tr.insertText(replacement, from, to).scrollIntoView())
      view.focus()
      onMenu(null)
    },
    addToDictionary: () => {
      const wordKey = word.toLowerCase()
      if (!spellcheckRuntime.customWords.has(wordKey)) {
        spellcheckRuntime.customWords.add(wordKey)
        // Notify every editor + re-check now; persist in main (the local set
        // is authoritative for this session).
        updateSpellcheckRuntime({ customWords: spellcheckRuntime.customWords })
        window.api.addSpellcheckWord(wordKey).catch(() => { /* non-critical */ })
      }
      applyDecorations(view)
      onMenu(null)
    }
  })
  return true
}
