import { watch as chokidarWatch, FSWatcher } from 'chokidar'
import { isMarkdown } from './read'
import type { WatchEvent, DocumentChangeEvent } from '../../shared/ipc-contract'

interface ChangeCallback {
  onWorkspaceChanged(e: WatchEvent): void
  onDocumentChanged(e: DocumentChangeEvent): void
}

export class WorkspaceWatcher {
  private watcher: FSWatcher | null = null
  private watchedDirs = new Set<string>()
  private suppressedPaths = new Map<string, number>()
  private callback: ChangeCallback | null = null

  start(root: string, cb: ChangeCallback): void {
    if (this.watcher) {
      this.stop()
    }

    this.callback = cb
    this.watchedDirs.add(root)

    // Only the root is scanned at startup. Deeper directories are added via
    // addPath() when the tree expands them or a document in them is opened,
    // so opening a large folder does not trigger a full-tree scan.
    this.watcher = chokidarWatch(root, {
      ignoreInitial: true,
      depth: 0,
      followSymlinks: false,
      ignored: ['**/node_modules/**', '**/.git/**', '**/.*']
    })

    const debounced = new Map<string, ReturnType<typeof setTimeout>>()

    const emit = (eventType: 'add' | 'change' | 'unlink', filePath: string, isDir: boolean) => {
      const debounceKey = `${eventType}:${filePath}`
      if (debounced.has(debounceKey)) {
        clearTimeout(debounced.get(debounceKey))
      }

      debounced.set(debounceKey, setTimeout(() => {
        debounced.delete(debounceKey)

        if (this.isSuppressed(filePath)) {
          return
        }

        const rel = filePath.slice(root.length).replace(/^[/\\]/, '').split('\\').join('/')

        if (!isDir && !isMarkdown(filePath)) {
          return
        }

        const kind = eventType === 'add' ? 'added' : eventType === 'unlink' ? 'removed' : 'changed'

        const cbRef = this.callback
        if (cbRef) {
          cbRef.onWorkspaceChanged({ path: rel, kind, isDirectory: isDir })

          if (!isDir && (kind === 'changed' || kind === 'removed')) {
            cbRef.onDocumentChanged({ path: rel, kind })
          }
        }
      }, 100))
    }

    this.watcher.on('add', (p: string) => emit('add', p, false))
    this.watcher.on('change', (p: string) => emit('change', p, false))
    this.watcher.on('unlink', (p: string) => emit('unlink', p, false))
    this.watcher.on('addDir', (p: string) => emit('add', p, true))
    this.watcher.on('unlinkDir', (p: string) => emit('unlink', p, true))
  }

  suppress(path: string): void {
    this.suppressedPaths.set(path, Date.now())
  }

  addPath(absolutePath: string): void {
    if (this.watchedDirs.has(absolutePath)) return
    this.watchedDirs.add(absolutePath)
    if (this.watcher) {
      this.watcher.add(absolutePath)
    }
  }

  private isSuppressed(filePath: string): boolean {
    const now = Date.now()
    for (const [suppressed, timestamp] of this.suppressedPaths.entries()) {
      if (now - timestamp > 2000) {
        this.suppressedPaths.delete(suppressed)
        continue
      }
      if (filePath === suppressed || filePath.startsWith(suppressed + '/') ||
          filePath.startsWith(suppressed + '\\')) {
        return true
      }
    }
    return false
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    this.watchedDirs.clear()
    this.callback = null
  }
}
