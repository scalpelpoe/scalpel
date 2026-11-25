import { reportBreadcrumb } from '../../common/diagnostics'

/** Persisted Linux input backend choice. */
export const LINUX_INPUT_BACKENDS = ['auto', 'uiohook', 'ydotool', 'wtype', 'compositor'] as const

export type LinuxInputBackend = (typeof LINUX_INPUT_BACKENDS)[number]

export function toLinuxInputBackend(value: unknown): LinuxInputBackend {
  return LINUX_INPUT_BACKENDS.find((backend) => backend === value) ?? 'auto'
}

let active: LinuxInputBackend = 'auto'

/** Set at boot from the store and updated by the settings IPC. */
export function setLinuxInputBackend(value: unknown): void {
  const next = toLinuxInputBackend(value)
  if (next === active) return
  active = next
  reportBreadcrumb(`[linux/input] preference=${active}`, 'debug')
}

export function getLinuxInputBackend(): LinuxInputBackend {
  return active
}

/** @internal Test-only reset. */
export function __resetLinuxInputBackendForTests(): void {
  active = 'auto'
}
