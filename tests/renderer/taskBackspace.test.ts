import { describe, it, expect } from 'vitest'
import { Schema, Node } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection } from '@milkdown/kit/prose/state'
import { planTaskBackspace } from '../../src/renderer/editor/taskBackspace'

/**
 * Minimal schema matching the shape this helper touches (research R-Task): a
 * `bullet_list` holding `list_item` nodes with a nullable `checked` attribute
 * (the task-list variant) and a `paragraph` per item — `paragraph` must exist
 * for the sole-item replacement (FR-17). toDOM/parseDOM are unnecessary: the
 * tests only exercise transactions, never DOM serialization.
 */
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    bullet_list: { content: 'list_item+', group: 'block' },
    list_item: {
      content: 'paragraph block*',
      group: 'block',
      attrs: { checked: { default: null } }
    }
  }
})

function para(text: string): Node {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : null)
}

function taskItem(text: string): Node {
  return schema.nodes.list_item.create({ checked: false }, para(text))
}

function plainItem(text: string): Node {
  return schema.nodes.list_item.create({ checked: null }, para(text))
}

function bullet(items: Node[]): Node {
  return schema.nodes.bullet_list.create(null, items)
}

function makeState(node: Node): EditorState {
  const doc = schema.nodes.doc.create(null, [node])
  return EditorState.create({ doc })
}

/** Position inside the `itemIndex`-th list item's paragraph (offset 0). */
function cursorAtStart(state: EditorState, itemIndex: number): EditorState {
  let count = 0
  let p = 1
  state.doc.descendants((n, pp) => {
    if (n.type.name !== 'list_item') return
    if (count === itemIndex) p = pp
    count++
  })
  // The item's paragraph opens at p+1; its first text offset is p+2.
  const caret = Math.min(p + 2, state.doc.content.size)
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, caret)))
}

describe('planTaskBackspace', () => {
  it('returns null for a non-collapsed text selection', () => {
    // A task item with text 'ab': select both characters → non-empty selection.
    const state = makeState(bullet([taskItem('ab')]))
    const sel = TextSelection.create(state.doc, 3, 5)
    const wide = state.apply(state.tr.setSelection(sel))
    expect(planTaskBackspace(wide)).toBeNull()
  })

  it('returns null when the empty item is not a task item (checked == null)', () => {
    const state = makeState(bullet([plainItem('')]))
    expect(planTaskBackspace(cursorAtStart(state, 0))).toBeNull()
  })

  it('returns null when the item has text (FR-018 ordinary deletion preserved)', () => {
    const state = makeState(bullet([taskItem('x')]))
    expect(planTaskBackspace(cursorAtStart(state, 0))).toBeNull()
  })

  it('returns null when the cursor is not at the very start of the item paragraph', () => {
    // A task item with one inline char: caret at the item's text offset 1
    // (after 'y') is not parentOffset 0, so ordinary deletion applies.
    const one = makeState(bullet([taskItem('y')]))
    const shifted = one.apply(one.tr.setSelection(
      TextSelection.create(one.doc, 4)
    ))
    expect(planTaskBackspace(shifted)).toBeNull()
  })

  it('removes a sole empty task item by replacing the list with a paragraph (FR-017)', () => {
    const state = makeState(bullet([taskItem('')]))
    const ts = cursorAtStart(state, 0)
    const tr = planTaskBackspace(ts)
    expect(tr).not.toBeNull()
    const next = ts.apply(tr!)
    expect(next.doc.textContent).toBe('')
    let hasList = false
    next.doc.descendants((n) => {
      if (n.type.name === 'list_item' || n.type.name === 'bullet_list') hasList = true
    })
    expect(hasList).toBe(false)
  })

  it('removes only the empty first task item, keeping siblings (FR-016)', () => {
    const state = makeState(bullet([taskItem(''), plainItem('b'), plainItem('c')]))
    const ts = cursorAtStart(state, 0)
    const tr = planTaskBackspace(ts)
    expect(tr).not.toBeNull()
    const next = ts.apply(tr!)
    const items: Node[] = []
    next.doc.descendants((n) => {
      if (n.type.name === 'list_item') items.push(n)
    })
    expect(items).toHaveLength(2)
    expect(next.doc.textContent).toBe('bc')
  })

  it('removes an empty middle task item, keeping siblings (FR-016)', () => {
    const state = makeState(bullet([plainItem('a'), taskItem(''), plainItem('c')]))
    const ts = cursorAtStart(state, 1)
    const tr = planTaskBackspace(ts)
    expect(tr).not.toBeNull()
    const next = ts.apply(tr!)
    expect(next.doc.textContent).toBe('ac')
  })

  it('does nothing when the parent block is not a list_item', () => {
    const state = makeState(para('z'))
    const sel = TextSelection.create(state.doc, 2, 2)
    const shifted = state.apply(state.tr.setSelection(sel))
    expect(planTaskBackspace(shifted)).toBeNull()
  })
})