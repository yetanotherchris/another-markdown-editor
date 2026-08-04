import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { buildNativeDialogOptions, decisionFromResponse } from '../shared/nativeDialog'
import type { NativeDialogDecision, NativeDialogRequest } from '../shared/ipc-contract'

/**
 * Spec 008: show the platform-native confirmation box for a request and resolve
 * with the semantic decision. This is the only place `dialog.showMessageBox`
 * is called for the app's confirmation surfaces (research R1). The async form
 * does not block the main process; the box is modal to `window` (a sheet on
 * macOS).
 */
export async function showNativeConfirmation(window: BrowserWindow, request: NativeDialogRequest): Promise<NativeDialogDecision> {
  const options = buildNativeDialogOptions(process.platform, request)
  const { response } = await dialog.showMessageBox(window, options)
  return decisionFromResponse(process.platform, request, response)
}
