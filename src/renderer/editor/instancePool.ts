import type { DocumentState } from '../state/documents'
import type { Crepe } from '@milkdown/crepe'

const MAX_INSTANCES = 8

interface InstanceEntry {
  documentId: string
  editor: Crepe
  lastActiveAt: number
}

class InstancePool {
  private instances = new Map<string, InstanceEntry>()

  register(documentId: string, editor: Crepe): void {
    this.instances.set(documentId, {
      documentId,
      editor,
      lastActiveAt: Date.now()
    })
  }

  remove(documentId: string): void {
    // The owning CrepeHost destroys the editor on unmount; this only drops the
    // bookkeeping entry. Destroying here would double-destroy the same editor.
    this.instances.delete(documentId)
  }

  getMarkdown(documentId: string): string | null {
    const entry = this.instances.get(documentId)
    if (!entry) return null
    // Reading the editor is a use: keep true LRU ordering for eviction.
    entry.lastActiveAt = Date.now()
    return entry.editor.getMarkdown()
  }

  /**
   * Returns the id of the oldest *clean* live instance to evict, or null when
   * nothing may be evicted (every live instance is dirty, or the only clean
   * one is the active document). The active document is never evicted — its
   * editor would vanish while visible. Does not remove the entry; the caller
   * does that after capturing any state it needs.
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

    return oldest ? oldest.documentId : null
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
