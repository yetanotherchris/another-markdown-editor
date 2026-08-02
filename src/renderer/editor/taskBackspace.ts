import { TextSelection } from '@milkdown/kit/prose/state'
import type { EditorState, Transaction } from '@milkdown/kit/prose/state'

/**
 * Pure decision helper for FR-016/017/018: pressing Backspace at the start of
 * an EMPTY task-list item should remove the item (or the whole list when it is
 * the only child) instead of leaving an undeletable checkbox.
 *
 * Returns a Transaction to dispatch when the keystroke is handled, or null so
 * the caller falls through to ProseMirror's ordinary Backspace (FR-018: other
 * deletions are never changed).
 *
 * Trigger conditions (research R-Task):
 *  - collapsed TextSelection,
 *  - cursor at the very start of the item's paragraph (parentOffset === 0),
 *  - the position's parent is a `list_item` with a `checked` attribute (the
 *    extended task-list variant, `taskListItemSchema`),
 *  - the item carries no text content.
 */
export function planTaskBackspace(state: EditorState): Transaction | null {
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const { $from } = selection
  if ($from.parentOffset !== 0) return null

  const item = $from.node(-1)
  if (!item || item.type.name !== 'list_item') return null
  if (item.attrs.checked == null) return null
  if (item.textContent.length !== 0) return null

  const list = $from.node(-2)
  const tr = state.tr

  if (list && list.childCount === 1) {
    // FR-017: the item is the only one — replace the whole list structure with
    // a paragraph so no checkbox is left behind. The cursor lands in it.
    const listStart = $from.before(-2)
    const listEnd = $from.after(-2)
    const paragraph = state.schema.nodes.paragraph
    if (!paragraph) return null
    tr.replaceWith(listStart, listEnd, paragraph.create())
    const cursorPos = Math.max(listStart, Math.min(tr.doc.content.size, listStart + 1))
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)))
    return tr
  }

  // FR-016: remove just the empty item; the remaining siblings stay coherent.
  const itemStart = $from.before(-1)
  const itemEnd = $from.after(-1)
  tr.delete(itemStart, itemEnd)
  const cursorPos = Math.max(0, Math.min(tr.doc.content.size, itemStart))
  tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)))
  return tr
}