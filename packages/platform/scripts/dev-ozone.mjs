import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Keep in sync with MANAGED_OZONE_ENV in src/linux/common/display.ts. This file
// is plain JS so the dev wrapper can call it without a TypeScript loader.
const MANAGED_OZONE_ENV = 'SCALPEL_MANAGED_OZONE'

/** Dev-only launch bootstrap. The root wrapper stays a generic launcher; all
 *  Ozone/config knowledge lives with the platform package. */
export function devOzoneBootstrap({
  platform,
  passthrough = [],
  env = {},
  configPath,
  read = readFileSync,
} = {}) {
  const nextEnv = { ...env }
  if (platform !== 'linux') return { args: [...passthrough], env: nextEnv }

  const explicit = passthrough.some((arg) => arg.startsWith('--ozone-platform='))
  if (explicit) {
    delete nextEnv[MANAGED_OZONE_ENV]
    return { args: [...passthrough], env: nextEnv }
  }

  const config =
    configPath ?? join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'scalpel', 'config.json')
  let mode = 'x11'
  try {
    if (JSON.parse(read(config, 'utf8')).platformDisplayMode === 'wayland') mode = 'wayland'
  } catch {
    // No or unreadable config: keep the X11 default.
  }

  nextEnv[MANAGED_OZONE_ENV] = '1'
  return { args: [...passthrough, `--ozone-platform=${mode}`], env: nextEnv }
}
