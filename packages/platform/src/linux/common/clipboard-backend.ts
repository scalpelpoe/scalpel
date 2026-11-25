import { reportBreadcrumb } from '../../common/diagnostics'

/** Persisted clipboard choice, kept in the package so the Linux clipboard
 *  facade does not depend on the app's settings types. */
export const LINUX_CLIPBOARD_BACKENDS = ['auto', 'wl-clipboard', 'compositor', 'native'] as const

export type LinuxClipboardBackend = (typeof LINUX_CLIPBOARD_BACKENDS)[number]

export function toLinuxClipboardBackend(value: unknown): LinuxClipboardBackend {
  return LINUX_CLIPBOARD_BACKENDS.find((backend) => backend === value) ?? 'auto'
}

let active: LinuxClipboardBackend = 'auto'

/** Set at boot from the store and updated by the settings IPC when wired. */
export function setLinuxClipboardBackend(value: unknown): void {
  const next = toLinuxClipboardBackend(value)
  if (next === active) return
  active = next
  reportBreadcrumb(`[linux/clipboard] preference=${active}`, 'debug')
}

export function getLinuxClipboardBackend(): LinuxClipboardBackend {
  return active
}

/** @internal Test-only reset. */
export function __resetLinuxClipboardBackendForTests(): void {
  active = 'auto'
}
