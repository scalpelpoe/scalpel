/**
 * Rejection thrown by {@link callNativeBackend}.
 *
 * It is constructed on the RENDERER side of the contextBridge on purpose:
 * Electron rebuilds an Error that crosses `contextBridge` from its `message`
 * alone, so a `name`/`code` attached in preload is dropped before plugin code
 * ever sees it. Preload therefore hands the result object over untouched and
 * this module turns it back into a throw.
 */
export class NativeCallError extends Error {
  readonly name = 'NativeCallError'

  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
  }
}

/** Invoke a plugin's native backend, unwrapping the never-rejecting IPC result. */
export async function callNativeBackend(pluginId: string, method: string, payload: Uint8Array): Promise<Uint8Array> {
  const result = await window.api.pluginNativeCall(pluginId, method, payload)
  if (result.ok) return result.payload
  throw new NativeCallError(result.error.message, result.error.code)
}
