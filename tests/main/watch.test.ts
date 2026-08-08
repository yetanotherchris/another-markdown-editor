import { describe, it, expect } from 'vitest'
import { WorkspaceWatcher } from '../../src/main/fs/watch'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `mm-watch-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('WorkspaceWatcher', () => {
  it('reports added files', async () => {
    const root = createTempDir()
    const watcher = new WorkspaceWatcher()
    const events: { path: string; kind: string }[] = []

    try {
      watcher.start(root, {
        onWorkspaceChanged: (e) => {
          events.push({ path: e.path, kind: e.kind })
        },
        onDocumentChanged: () => {}
      })

      await delay(300)
      fs.writeFileSync(path.join(root, 'new.md'), '# test')
      await delay(300)

      const added = events.filter(e => e.path === 'new.md' && e.kind === 'added')
      expect(added.length).toBeGreaterThanOrEqual(1)
    } finally {
      watcher.stop()
      cleanupTempDir(root)
    }
  })

  it('reports changed files', async () => {
    const root = createTempDir()
    const watcher = new WorkspaceWatcher()

    fs.writeFileSync(path.join(root, 'existing.md'), '# old')
    const events: { path: string; kind: string }[] = []

    try {
      watcher.start(root, {
        onWorkspaceChanged: (e) => {
          events.push({ path: e.path, kind: e.kind })
        },
        onDocumentChanged: () => {}
      })

      await delay(300)
      fs.writeFileSync(path.join(root, 'existing.md'), '# new')
      await delay(500)

      const changed = events.filter(e => e.path === 'existing.md' && e.kind === 'changed')
      expect(changed.length).toBeGreaterThanOrEqual(1)
    } finally {
      watcher.stop()
      cleanupTempDir(root)
    }
  })

  it('reports changes in directories added after startup', async () => {
    const root = createTempDir()
    const sub = path.join(root, 'sub')
    fs.mkdirSync(sub)
    const watcher = new WorkspaceWatcher()
    const events: { path: string; kind: string }[] = []

    try {
      watcher.start(root, {
        onWorkspaceChanged: (e) => {
          events.push({ path: e.path, kind: e.kind })
        },
        onDocumentChanged: () => {}
      })

      await delay(300)

      // Directory not watched yet: changes inside it are not reported.
      fs.writeFileSync(path.join(sub, 'hidden.md'), '# test')
      await delay(300)
      expect(events.filter(e => e.path === 'sub/hidden.md').length).toBe(0)

      // Add the directory to the watch set, then changes inside it are reported.
      watcher.addPath(sub)
      await delay(300)
      fs.writeFileSync(path.join(sub, 'visible.md'), '# test')
      await delay(500)

      const added = events.filter(e => e.path === 'sub/visible.md' && e.kind === 'added')
      expect(added.length).toBeGreaterThanOrEqual(1)
    } finally {
      watcher.stop()
      cleanupTempDir(root)
    }
  })

  it('suppresses self-writes', async () => {
    const root = createTempDir()
    const watcher = new WorkspaceWatcher()
    const events: { path: string; kind: string }[] = []

    try {
      watcher.start(root, {
        onWorkspaceChanged: (e) => {
          events.push({ path: e.path, kind: e.kind })
        },
        onDocumentChanged: () => {}
      })

      await delay(300)

      const targetPath = path.join(root, 'self.md')
      watcher.suppress(targetPath)
      fs.writeFileSync(targetPath, '# self')
      await delay(500)

      const selfEvents = events.filter(e => e.path === 'self.md')
      expect(selfEvents.length).toBe(0)
    } finally {
      watcher.stop()
      cleanupTempDir(root)
    }
  })
})
