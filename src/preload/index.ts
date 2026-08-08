import { contextBridge, ipcRenderer } from 'electron'
import type {
  DesktopApi,
  Result,
  WorkspaceInfo,
  DirEntry,
  OpenedFile,
  WriteReceipt,
  EntryKind,
  TrashReceipt,
  Settings,
  WatchEvent,
  DocumentChangeEvent,
  MenuCommand,
  EntryInfo,
  RecentItemsWarning,
  NativeDialogRequest,
  NativeDialogDecision,
  RecentItem,
  ErrorCode
} from '../shared/ipc-contract'

const ERROR_CODES = new Set<ErrorCode>([
  'OUTSIDE_WORKSPACE',
  'NOT_FOUND',
  'CONFLICT',
  'PERMISSION',
  'LOCKED',
  'TOO_LARGE',
  'NOT_TEXT',
  'TRASH_UNAVAILABLE',
  'NO_WORKSPACE',
  'IO'
])

function isResult(value: unknown): value is Result<unknown> {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  if (result.ok === true) return 'value' in result
  return (
    result.ok === false &&
    typeof result.message === 'string' &&
    ERROR_CODES.has(result.code as ErrorCode)
  )
}

async function invokeResult<T>(channel: string, ...args: unknown[]): Promise<Result<T>> {
  const result: unknown = await ipcRenderer.invoke(channel, ...args)
  if (isResult(result)) return result as Result<T>
  return { ok: false, code: 'IO', message: 'Invalid IPC response' }
}

const api: DesktopApi = {
  platform: process.platform,
  prepareFolderOpen: (path?: string) =>
    invokeResult<WorkspaceInfo | null>(
      'workspace:prepareFolderOpen',
      path === undefined ? undefined : { path }
    ),
  commitFolderOpen: () => invokeResult<WorkspaceInfo>('workspace:commitFolderOpen'),
  cancelFolderOpen: () => invokeResult<null>('workspace:cancelFolderOpen'),
  readDir: (relativePath: string) =>
    invokeResult<DirEntry[]>('workspace:readDir', { path: relativePath }),
  openFileDialog: () => invokeResult<OpenedFile | null>('file:openDialog'),
  readFile: (relativePath: string) => invokeResult<OpenedFile>('file:read', { path: relativePath }),
  openRecentFile: (path: string) => invokeResult<OpenedFile>('recent:openFile', { path }),
  writeFile: (relativePath: string, content: string) =>
    invokeResult<WriteReceipt>('file:write', { path: relativePath, content }),
  saveFileDialog: (suggestedName: string, content: string) =>
    invokeResult<OpenedFile | null>('file:saveDialog', { suggestedName, content }),
  createEntry: (parentRelativePath: string, name: string, kind: EntryKind) =>
    invokeResult<DirEntry>('entry:create', { parentPath: parentRelativePath, name, kind }),
  moveEntry: (fromRelativePath: string, toRelativePath: string) =>
    invokeResult<DirEntry>('entry:move', { fromPath: fromRelativePath, toPath: toRelativePath }),
  trashEntry: (relativePath: string, permanent?: boolean) =>
    invokeResult<TrashReceipt>('entry:trash', { path: relativePath, permanent }),
  describeEntry: (relativePath: string) =>
    invokeResult<EntryInfo>('entry:describe', { path: relativePath }),
  revealEntry: (relativePath: string, kind: EntryKind) =>
    invokeResult<null>('entry:reveal', { path: relativePath, kind }),
  getSettings: () => invokeResult<Settings>('settings:get'),
  updateSettings: (patch: Partial<Settings>) => invokeResult<Settings>('settings:update', patch),

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

  onRecentItemsWarning: (cb: (w: RecentItemsWarning) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, warning: RecentItemsWarning) => cb(warning)
    ipcRenderer.on('recentItems:warning', handler)
    return () => ipcRenderer.removeListener('recentItems:warning', handler)
  },

  onRecentItemsOk: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('recentItems:ok', handler)
    return () => ipcRenderer.removeListener('recentItems:ok', handler)
  },

  onQuitRequested: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('app:quitRequested', handler)
    return () => ipcRenderer.removeListener('app:quitRequested', handler)
  },

  confirmQuit: (decision: 'quit' | 'cancel') => {
    ipcRenderer.invoke('quit:respond', { decision })
  },

  showConfirmation: (request: NativeDialogRequest) =>
    invokeResult<NativeDialogDecision>('dialog:show', request),

  getRecentItems: () => invokeResult<RecentItem[]>('recent:list'),
  clearRecentItems: () => invokeResult<null>('recent:clear'),
  requestQuit: () => invokeResult<null>('app:requestQuit'),
  toggleDevTools: () => invokeResult<null>('devtools:toggle'),
  getSpellcheckWords: () => invokeResult<string[]>('spellcheck:getWords'),
  addSpellcheckWord: (word: string) => invokeResult<string[]>('spellcheck:addWord', { word })
}

contextBridge.exposeInMainWorld('api', api)
