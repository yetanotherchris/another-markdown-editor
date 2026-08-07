/**
 * List tight/loose serialization fix (2026-08-07).
 *
 * Milkdown's `bullet_list` and `list_item` toMarkdown runners pass the
 * ProseMirror `spread` attribute straight through to the remark AST. That
 * attribute is a STRING (`"false"` / `"true"`) because the parse runners
 * stringify the remark node's boolean `spread` (`${node.spread}`). remark's
 * stringifier (`mdast-util-to-markdown`) only applies its tight/loose
 * blank-line logic when `typeof node.spread === 'boolean'` (lib/join.js), so a
 * string `"false"` is truthy there and the list serializes LOOSE — blank lines
 * inserted between every item, which GitHub renders as the double spacing.
 * `ordered_list` already compares `node.attrs.spread === "true"`, so ordered
 * lists were never affected; only bullet lists and list items were.
 *
 * Both composables below inherit the upstream schema (attrs, parseDOM, toDOM,
 * parseMarkdown) untouched and replace ONLY the toMarkdown runner with one that
 * coerces `spread` to a real boolean, mirroring the ordered_list runner. The
 * list_item extension chains off gfm's task extension so task-list checkboxes
 * keep working: task items delegate to gfm's own runner (which already coerces
 * spread); non-task items emit the coerced value directly.
 *
 * Effect on round-trip: a tight list (no blank lines between items) stays
 * tight; a list the user genuinely left loose stays loose. The pre-existing
 * `-` → `*` bullet rewrite is remark's canonical marker choice and is not
 * addressed here.
 */

import { bulletListSchema } from '@milkdown/kit/preset/commonmark'
import { extendListItemSchemaForTask } from '@milkdown/kit/preset/gfm'

/** bullet_list: coerce `spread` so tight bullet lists stay tight. */
export const fixedBulletListSchema = bulletListSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx)
  return {
    ...base,
    toMarkdown: {
      match: (node) => node.type.name === 'bullet_list',
      runner: (state, node) => {
        state
          .openNode('list', void 0, { ordered: false, spread: node.attrs.spread === 'true' })
          .next(node.content)
          .closeNode()
      }
    }
  }
})

/** list_item: coerce `spread` for non-task items; task items keep gfm's runner. */
export const fixedListItemSchema = extendListItemSchemaForTask.extendSchema((prev) => (ctx) => {
  const base = prev(ctx)
  return {
    ...base,
    toMarkdown: {
      match: (node) => node.type.name === 'list_item',
      runner: (state, node) => {
        if (node.attrs.checked != null) {
          base.toMarkdown.runner(state, node)
          return
        }
        state.openNode('listItem', void 0, { spread: node.attrs.spread === 'true' }).next(node.content).closeNode()
      }
    }
  }
})

/** Both schema overrides, registered after the commonmark/gfm presets. */
export const tightListPlugins = [fixedBulletListSchema, fixedListItemSchema]
