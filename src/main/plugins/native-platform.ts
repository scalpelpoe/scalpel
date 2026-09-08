export interface NativeHostPlatform {
  platform: string
  arch: string
}

export const RFC1_NATIVE_TARGET = 'win32-x64' as const

export function nativeTargetForHost(host: NativeHostPlatform = process): typeof RFC1_NATIVE_TARGET | null {
  return host.platform === 'win32' && host.arch === 'x64' ? RFC1_NATIVE_TARGET : null
}

export function nativeHostTarget(host: NativeHostPlatform = process): string {
  return `${host.platform}-${host.arch}`
}

export function unsupportedNativePlatformMessage(host: NativeHostPlatform = process): string {
  return `native backends require ${RFC1_NATIVE_TARGET} (running ${nativeHostTarget(host)})`
}
