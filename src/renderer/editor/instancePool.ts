import type { DocumentState } from '../state/documents'
import type { Crepe } from '@milkdown/crepe'

const MAX_INSTANCES = 8

interface InstanceEntry {
  documentId: string
  editor: Crepe
  cursorOffset: number
  scrollTop: number
  lastActiveAt: number
}

class InstancePool {
  private instances = new Map<string, InstanceEntry>()

  has(documentId: string): boolean {
    return this.instances.has(documentId)
  }

  get(documentId: string): InstanceEntry | undefined {
    const entry = this.instances.get(documentId)
    if (entry) {
      entry.lastActiveAt = Date.now()
    }
    return entry
  }

  register(documentId: string, editor: Crepe): void {
    this.instances.set(documentId, {
      documentId,
      editor,
      cursorOffset: 0,
      scrollTop: 0,
      lastActiveAt: Date.now()
    })
  }

  remove(documentId: string): void {
    // The owning CrepeHost destroys the editor on unmount; this only drops the
    // bookkeeping entry. Destroying here would double-destroy the same editor.
    this.instances.delete(documentId)
  }

  saveCursorState(documentId: string, cursorOffset: number, scrollTop: number): void {
    const entry = this.instances.get(documentId)
    if (entry) {
      entry.cursorOffset = cursorOffset
      entry.scrollTop = scrollTop
    }
  }

  getMarkdown(documentId: string): string | null {
    const entry = this.instances.get(documentId)
    if (!entry) return null
    return entry.editor.getMarkdown()
  }

  /**
   * Returns the id of the oldest *clean* live instance to evict, or null when
   * nothing may be evicted (every live instance is dirty, or the only clean
   * one is the active document). The active document is never evicted — its
   * editor would vanish while visible.
   */
  evictLRU(dirtyDocuments: DocumentState[], activeId: string | null): string | null {
    const dirtyIds = new Set(dirtyDocuments.map(d => d.id))
    let oldest: InstanceEntry | null = null

    for (const entry of this.instances.values()) {
      if (entry.documentId === activeId) continue
      if (dirtyIds.has(entry.documentId)) continue
      if (!oldest || entry.lastActiveAt < oldest.lastActiveAt) {
        oldest = entry
      }
    }

    if (oldest) {
      this.remove(oldest.documentId)
      return oldest.documentId
    }

    return null
  }

  get liveCount(): number {
    return this.instances.size
  }

  hasSpace(): boolean {
    return this.instances.size < MAX_INSTANCES
  }

  destroyAll(): void {
    for (const entry of this.instances.values()) {
      entry.editor.destroy()
    }
    this.instances.clear()
  }
}

export const instancePool = new InstancePool()
