import { describe, expect, it } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { ctx, isAuthorizedRenderer } from '../../src/main/ipc/handlers/context'

describe('IPC renderer authorization', () => {
  it('accepts only the registered window web contents', () => {
    const webContents = {}
    const window = { webContents } as BrowserWindow
    ctx.approvedRendererUrl = 'file:///app/index.html'
    const event = { sender: webContents, senderFrame: { url: 'file:///app/index.html' } } as unknown as IpcMainInvokeEvent

    expect(isAuthorizedRenderer(event, window)).toBe(true)
    ctx.approvedRendererUrl = null
  })

  it('rejects a different renderer sender', () => {
    const window = { webContents: {} } as BrowserWindow
    ctx.approvedRendererUrl = 'file:///app/index.html'
    const event = { sender: {}, senderFrame: { url: 'file:///app/index.html' } } as unknown as IpcMainInvokeEvent

    expect(isAuthorizedRenderer(event, window)).toBe(false)
    ctx.approvedRendererUrl = null
  })

  it('rejects a trusted sender with an unapproved frame URL', () => {
    const webContents = {}
    const window = { webContents } as BrowserWindow
    ctx.approvedRendererUrl = 'file:///app/index.html'
    const event = { sender: webContents, senderFrame: { url: 'file:///other/index.html' } } as unknown as IpcMainInvokeEvent

    expect(isAuthorizedRenderer(event, window)).toBe(false)
    ctx.approvedRendererUrl = null
  })
})
