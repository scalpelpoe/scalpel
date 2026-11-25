/** Linux display-mode helpers. Ported from the Wayland-native work: an explicit
 *  Ozone flag wins, while flags injected during an app-managed relaunch are not
 *  "explicit" and must not lock the user out of the display selector. */
export type LinuxDisplayMode = 'x11' | 'wayland'

const PREFIX = '--ozone-platform='
export const MANAGED_OZONE_ENV = 'SCALPEL_MANAGED_OZONE'

export function toLinuxDisplayMode(value: unknown): LinuxDisplayMode {
  return value === 'wayland' ? 'wayland' : 'x11'
}

export function ozoneModeFromArgs(args: readonly string[]): LinuxDisplayMode | undefined {
  const flag = args.find((arg) => arg.startsWith(PREFIX))
  return flag ? toLinuxDisplayMode(flag.slice(PREFIX.length)) : undefined
}

/** The mode from a user-supplied flag, ignoring app-managed relaunch flags. */
export function explicitLinuxDisplayMode(
  args: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): LinuxDisplayMode | undefined {
  if (env[MANAGED_OZONE_ENV] === '1') return undefined
  return ozoneModeFromArgs(args)
}

/** An explicit launch flag wins over the saved preference. */
export function effectiveLinuxDisplayMode(saved: unknown, args: readonly string[] = process.argv): LinuxDisplayMode {
  return ozoneModeFromArgs(args) ?? toLinuxDisplayMode(saved)
}

/** Drop stale flags so a relaunch has exactly one Ozone switch. */
export function ozoneArgsForMode(args: readonly string[], mode: LinuxDisplayMode): string[] {
  return [...args.filter((arg) => !arg.startsWith(PREFIX)), `${PREFIX}${mode}`]
}

/** True when this process actually runs with native Wayland Ozone. The flag is
 *  authoritative; a saved setting alone may not have been applied yet. */
export function isNativeWayland(args: readonly string[] = process.argv): boolean {
  return ozoneModeFromArgs(args) === 'wayland'
}
