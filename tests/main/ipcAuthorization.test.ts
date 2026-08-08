import { describe, expect, it } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { isAuthorizedRenderer } from '../../src/main/ipc/handlers/context'

describe('IPC renderer authorization', () => {
  it('accepts only the registered window web contents', () => {
    const webContents = {}
    const window = { webContents } as BrowserWindow
    const event = { sender: webContents } as IpcMainInvokeEvent

    expect(isAuthorizedRenderer(event, window)).toBe(true)
  })

  it('rejects a different renderer sender', () => {
    const window = { webContents: {} } as BrowserWindow
    const event = { sender: {} } as IpcMainInvokeEvent

    expect(isAuthorizedRenderer(event, window)).toBe(false)
  })
})
