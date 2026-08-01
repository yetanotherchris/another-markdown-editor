import * as fs from 'fs'
import { readDir } from './fs/read'
import { WorkspaceWatcher } from './fs/watch'
import type { DirEntry, WatchEvent, DocumentChangeEvent } from '../shared/ipc-contract'

export class WorkspaceState {
  rootPath: string | null = null
  name: string | null = null
  private watcher = new WorkspaceWatcher()

  constructor(
    private onWorkspaceEvent: (event: WatchEvent) => void,
    private onDocumentEvent: (e: DocumentChangeEvent) => void
  ) {}

  open(root: string): void {
    this.rootPath = root
    this.name = root.split(/[/\\]/).pop() || root

    this.watcher.start(root, {
      onWorkspaceChanged: (e) => {
        if (e.kind === 'changed' && e.isDirectory) return
        this.onWorkspaceEvent(e)
      },
      onDocumentChanged: (e) => {
        this.onDocumentEvent(e)
      }
    })
  }

  getEntries(rootRelativePath: string): DirEntry[] {
    if (!this.rootPath) return []
    try {
      return readDir(this.rootPath, rootRelativePath)
    } catch {
      return []
    }
  }

  suppressWatch(absolutePath: string): void {
    this.watcher.suppress(absolutePath)
  }

  close(): void {
    this.watcher.stop()
    this.rootPath = null
    this.name = null
  }

  isAvailable(): boolean {
    if (!this.rootPath) return false
    try {
      fs.accessSync(this.rootPath)
      return true
    } catch {
      return false
    }
  }
}
