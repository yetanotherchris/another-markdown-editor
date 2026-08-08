import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import TabBar from '../../src/renderer/tabs/TabBar'
import { createEmpty } from '../../src/renderer/state/documents'

let root: Root | null = null
let container: HTMLDivElement | null = null

function render(node: ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
})

function tabDoc(
  id: string,
  title: string,
  overrides: Partial<ReturnType<typeof createEmpty>> = {}
) {
  return { ...createEmpty(1), id, title, ...overrides }
}

describe('TabBar (spec 010 FR-003/004)', () => {
  it('renders the "+" new-file button even with no documents (spec edge)', () => {
    render(
      <TabBar
        documents={[]}
        activeId={null}
        onActivate={() => {}}
        onClose={() => {}}
        onNew={() => {}}
      />
    )
    const button = container!.querySelector<HTMLButtonElement>('button.tab-new')
    expect(button).not.toBeNull()
    expect(button!.getAttribute('aria-label')).toBe('New file')
    expect(button!.querySelector('.tab-new-icon')).not.toBeNull()
    expect(container!.querySelectorAll('[role="tab"]')).toHaveLength(0)
  })

  it('marks the active tab with the active pill class', () => {
    const a = tabDoc('a', 'alpha.md')
    const b = tabDoc('b', 'beta.md')
    render(
      <TabBar
        documents={[a, b]}
        activeId="a"
        onActivate={() => {}}
        onClose={() => {}}
        onNew={() => {}}
      />
    )
    const tabs = container!.querySelectorAll<HTMLElement>('[role="tab"]')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].className).toContain('active')
    expect(tabs[1].className).not.toContain('active')
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
  })

  it('active tab renders the PencilSquare edit icon, the label, and an XMark close', () => {
    const a = tabDoc('a', 'alpha.md')
    render(
      <TabBar
        documents={[a]}
        activeId="a"
        onActivate={() => {}}
        onClose={() => {}}
        onNew={() => {}}
      />
    )
    const tab = container!.querySelector<HTMLElement>('[role="tab"].active')!
    expect(tab.querySelector('.tab-edit-icon')).not.toBeNull()
    expect(tab.querySelector('.tab-title')!.textContent).toBe('alpha.md')
    const close = tab.querySelector<HTMLButtonElement>('button.tab-close')!
    expect(close.querySelector('.tab-close-icon')).not.toBeNull()
    expect(close.getAttribute('aria-label')).toBe('Close alpha.md')
  })

  it('clicking the "+" fires onNew without touching the tabs', () => {
    const onNew = vi.fn()
    const a = tabDoc('a', 'alpha.md')
    render(
      <TabBar documents={[a]} activeId="a" onActivate={() => {}} onClose={() => {}} onNew={onNew} />
    )
    act(() => container!.querySelector<HTMLButtonElement>('button.tab-new')!.click())
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(container!.querySelectorAll('[role="tab"]')).toHaveLength(1)
  })

  it('clicking the XMark close calls onClose for that tab only', () => {
    const onClose = vi.fn()
    const a = tabDoc('a', 'alpha.md')
    const b = tabDoc('b', 'beta.md')
    render(
      <TabBar
        documents={[a, b]}
        activeId="a"
        onActivate={() => {}}
        onClose={onClose}
        onNew={() => {}}
      />
    )
    const closes = container!.querySelectorAll<HTMLButtonElement>('button.tab-close')
    act(() => closes[1].click())
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledWith('b')
  })

  it('keeps the dirty and deleted-on-disk markers with their aria-labels', () => {
    const dirty = tabDoc('a', 'a.md', { dirty: true })
    const deleted = tabDoc('b', 'b.md', { externalState: 'deletedOnDisk' })
    render(
      <TabBar
        documents={[dirty, deleted]}
        activeId="a"
        onActivate={() => {}}
        onClose={() => {}}
        onNew={() => {}}
      />
    )
    const tabs = container!.querySelectorAll<HTMLElement>('[role="tab"]')
    expect(tabs[0].querySelector('.tab-dirty')!.getAttribute('aria-label')).toBe('unsaved changes')
    expect(tabs[1].querySelector('.tab-warning')!.getAttribute('aria-label')).toBe(
      'deleted on disk'
    )
  })

  it('activates a focused tab with Enter and Space', () => {
    const onActivate = vi.fn()
    render(
      <TabBar
        documents={[tabDoc('a', 'alpha.md')]}
        activeId={null}
        onActivate={onActivate}
        onClose={() => {}}
        onNew={() => {}}
      />
    )
    const tab = container!.querySelector<HTMLElement>('[role="tab"]')!
    act(() => {
      tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      tab.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    })
    expect(onActivate).toHaveBeenCalledTimes(2)
    expect(tab.tabIndex).toBe(0)
  })
})
