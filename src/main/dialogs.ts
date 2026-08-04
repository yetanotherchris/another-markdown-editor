import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { buildNativeDialogOptions, decisionFromResponse } from '../shared/nativeDialog'
import type { NativeDialogDecision, NativeDialogRequest, ErrorCode } from '../shared/ipc-contract'

// Defense-in-depth (security review 2026-08-04): the renderer's single-prompt
// guard is React bookkeeping that any code calling `window.api.showConfirmation`
// bypasses. Main rejects a second dialog while one is up so a compromised or
// buggy renderer cannot stack modal boxes (UI-only DoS; no data path crosses the
// boundary). Unreachable in the normal flows, which hold the renderer guard.
let confirmationInFlight = false

/**
 * Spec 008: show the platform-native confirmation box for a request and resolve
 * with the semantic decision. This is the only place `dialog.showMessageBox`
 * is called for the app's confirmation surfaces (research R1). The async form
 * does not block the main process; the box is modal to `window` (a sheet on
 * macOS).
 */
export async function showNativeConfirmation(window: BrowserWindow, request: NativeDialogRequest): Promise<NativeDialogDecision> {
  if (confirmationInFlight) {
    throw Object.assign(new Error('A native confirmation dialog is already open'), { code: 'IO' as ErrorCode })
  }
  confirmationInFlight = true
  try {
    const options = buildNativeDialogOptions(process.platform, request)
    const { response } = await dialog.showMessageBox(window, options)
    return decisionFromResponse(process.platform, request, response)
  } finally {
    confirmationInFlight = false
  }
}
