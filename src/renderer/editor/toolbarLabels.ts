/**
 * Ordered, stable label map for the Crepe top-bar controls (research.md WG).
 *
 * Crepe's `TopBar` renders every item in DOM order with NO title or aria-label
 * (verified: feature/top-bar/index.js renderButton/renderSelector). The app's
 * fixed feature set ([TopBar]: true, [Toolbar]: false, [BlockEdit]: false,
 * ImageBlock/Table/Latex off) yields a deterministic control order:
 * heading selector, then each top-bar-item in getGroups() order, then the
 * custom "view-source" group appended by buildTopBar.
 */

export interface ToolbarLabel {
  title: string
  ariaLabel: string
}

export const TOP_BAR_LABELS: readonly ToolbarLabel[] = [
  { title: 'Paragraph style', ariaLabel: 'Paragraph or heading style' },
  { title: 'Bold', ariaLabel: 'Bold' },
  { title: 'Italic', ariaLabel: 'Italic' },
  { title: 'Strikethrough', ariaLabel: 'Strikethrough' },
  { title: 'Inline code', ariaLabel: 'Inline code' },
  { title: 'Bullet list', ariaLabel: 'Bullet list' },
  { title: 'Ordered list', ariaLabel: 'Ordered list' },
  { title: 'Task list', ariaLabel: 'Task list' },
  { title: 'Insert link', ariaLabel: 'Insert link' },
  { title: 'Insert image', ariaLabel: 'Insert image' },
  { title: 'Insert table', ariaLabel: 'Insert table' },
  { title: 'Code block', ariaLabel: 'Code block' },
  { title: 'Math', ariaLabel: 'Math formula' },
  { title: 'Blockquote', ariaLabel: 'Blockquote' },
  { title: 'Horizontal rule', ariaLabel: 'Horizontal rule' },
  { title: 'View source', ariaLabel: 'View source' }
] as const

const BUTTON_SELECTOR = '.top-bar-heading-button, .top-bar-item'

/**
 * Assign `title` + `aria-label` to every top-bar control inside `container`,
 * matched by DOM order. Controls outside the known set (e.g. a future button
 * after a feature-flag change) keep whatever the library gave them.
 */
export function applyToolbarLabels(container: HTMLElement): number {
  const controls = Array.from(container.querySelectorAll<HTMLElement>(BUTTON_SELECTOR))
  let labelled = 0
  controls.forEach((button, index) => {
    const label = TOP_BAR_LABELS[index]
    if (!label) return
    button.title = label.title
    button.setAttribute('aria-label', label.ariaLabel)
    labelled++
  })
  // A library or feature-flag change that drifts the DOM count from the map
  // mislabels controls silently; break loudly instead (research WG).
  if (controls.length !== TOP_BAR_LABELS.length) {
    console.warn(
      `[toolbar-labels] DOM has ${controls.length} top-bar controls but TOP_BAR_LABELS has ` +
        `${TOP_BAR_LABELS.length}; labels may be misaligned`
    )
  }
  return labelled
}