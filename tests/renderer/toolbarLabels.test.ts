import { describe, it, expect } from 'vitest'
import { TOP_BAR_LABELS, applyToolbarLabels } from '../../src/renderer/editor/toolbarLabels'

describe('toolbar labels map (research WG)', () => {
  it('labels every control the crepe top bar renders for our fixed feature set', () => {
    // Heading selector + bold/italic/strikethrough/code + bullet/ordered/task
    // + link + image + table + code-block + math + quote + hr + the custom
    // view-source group. Crepe keeps ImageBlock/Table/Latex at their feature
    // defaults, so all 16 controls are present (research.md R7).
    expect(TOP_BAR_LABELS).toHaveLength(16)
  })

  it('each entry has a non-empty title and aria-label', () => {
    for (const label of TOP_BAR_LABELS) {
      expect(label.title.trim().length).toBeGreaterThan(0)
      expect(label.ariaLabel.trim().length).toBeGreaterThan(0)
    }
  })

  it('assigns title and aria-label to controls in DOM order', () => {
    const container = document.createElement('div')
    const heading = document.createElement('button')
    heading.className = 'top-bar-heading-button'
    const one = document.createElement('button')
    one.className = 'top-bar-item'
    const two = document.createElement('button')
    two.className = 'top-bar-item'
    container.append(heading, one, two)

    const labelled = applyToolbarLabels(container)
    expect(labelled).toBe(3)
    expect(heading.title).toBe(TOP_BAR_LABELS[0].title)
    expect(heading.getAttribute('aria-label')).toBe(TOP_BAR_LABELS[0].ariaLabel)
    expect(one.title).toBe(TOP_BAR_LABELS[1].title)
    expect(two.getAttribute('aria-label')).toBe(TOP_BAR_LABELS[2].ariaLabel)
  })

  it('labels each control independently in DOM order', () => {
    const container = document.createElement('div')
    const heading = document.createElement('button')
    heading.className = 'top-bar-heading-button'
    const extra = document.createElement('button')
    extra.className = 'top-bar-item'
    const another = document.createElement('button')
    another.className = 'top-bar-item'
    // `extra` appears first in DOM order, then heading, then `another`.
    container.append(extra, heading, another)

    applyToolbarLabels(container)
    expect(extra.title).toBe(TOP_BAR_LABELS[0].title)
    expect(heading.title).toBe(TOP_BAR_LABELS[1].title)
    expect(another.getAttribute('aria-label')).toBe(TOP_BAR_LABELS[2].ariaLabel)
  })

  it('last entry identifies the view-source control (FR-15)', () => {
    expect(TOP_BAR_LABELS[TOP_BAR_LABELS.length - 1]).toEqual({
      title: 'View source',
      ariaLabel: 'View source'
    })
  })

  it('returns the number of matched controls labelled', () => {
    const container = document.createElement('div')
    const h = document.createElement('button')
    h.className = 'top-bar-heading-button'
    const b = document.createElement('button')
    b.className = 'top-bar-item'
    container.append(h, b)
    expect(applyToolbarLabels(container)).toBe(2)
  })
})