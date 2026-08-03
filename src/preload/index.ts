import { contextBridge, ipcRenderer } from 'electron'
import type {
  DesktopApi, Result, WorkspaceInfo, DirEntry, OpenedFile,
  WriteReceipt, EntryKind, TrashReceipt, Settings,
  WatchEvent, DocumentChangeEvent, MenuCommand, EntryInfo
} from '../shared/ipc-contract'

const api: DesktopApi = {
  openFolderDialog: () => ipcRenderer.invoke('workspace:openDialog') as Promise<Result<WorkspaceInfo | null>>,
  readDir: (relativePath: string) => ipcRenderer.invoke('workspace:readDir', { path: relativePath }) as Promise<Result<DirEntry[]>>,
  openFileDialog: () => ipcRenderer.invoke('file:openDialog') as Promise<Result<OpenedFile | null>>,
  readFile: (relativePath: string) => ipcRenderer.invoke('file:read', { path: relativePath }) as Promise<Result<OpenedFile>>,
  openRecentFile: (path: string) => ipcRenderer.invoke('recent:openFile', { path }) as Promise<Result<OpenedFile>>,
  openRecentFolder: (path: string) => ipcRenderer.invoke('recent:openFolder', { path }) as Promise<Result<WorkspaceInfo>>,
  writeFile: (relativePath: string, content: string) => ipcRenderer.invoke('file:write', { path: relativePath, content }) as Promise<Result<WriteReceipt>>,
  saveFileDialog: (suggestedName: string, content: string) => ipcRenderer.invoke('file:saveDialog', { suggestedName, content }) as Promise<Result<OpenedFile | null>>,
  createEntry: (parentRelativePath: string, name: string, kind: EntryKind) => ipcRenderer.invoke('entry:create', { parentPath: parentRelativePath, name, kind }) as Promise<Result<DirEntry>>,
  moveEntry: (fromRelativePath: string, toRelativePath: string) => ipcRenderer.invoke('entry:move', { fromPath: fromRelativePath, toPath: toRelativePath }) as Promise<Result<DirEntry>>,
  trashEntry: (relativePath: string, permanent?: boolean) => ipcRenderer.invoke('entry:trash', { path: relativePath, permanent }) as Promise<Result<TrashReceipt>>,
  describeEntry: (relativePath: string) => ipcRenderer.invoke('entry:describe', { path: relativePath }) as Promise<Result<EntryInfo>>,
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<Result<Settings>>,
  updateSettings: (patch: Partial<Settings>) => ipcRenderer.invoke('settings:update', patch) as Promise<Result<Settings>>,

  onWorkspaceChanged: (cb: (e: WatchEvent) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: WatchEvent) => cb(data)
    ipcRenderer.on('workspace:changed', handler)
    return () => ipcRenderer.removeListener('workspace:changed', handler)
  },

  onDocumentChanged: (cb: (e: DocumentChangeEvent) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: DocumentChangeEvent) => cb(data)
    ipcRenderer.on('document:externallyChanged', handler)
    return () => ipcRenderer.removeListener('document:externallyChanged', handler)
  },

  onMenuCommand: (cb: (c: MenuCommand) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, command: MenuCommand) => cb(command)
    ipcRenderer.on('menu:command', handler)
    return () => ipcRenderer.removeListener('menu:command', handler)
  },

  onQuitRequested: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('app:quitRequested', handler)
    return () => ipcRenderer.removeListener('app:quitRequested', handler)
  },

  confirmQuit: (decision: 'quit' | 'cancel') => {
    ipcRenderer.invoke('quit:respond', { decision })
  }
}

contextBridge.exposeInMainWorld('api', api)
