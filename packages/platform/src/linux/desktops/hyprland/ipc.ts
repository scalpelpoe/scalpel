import { execFileSync } from 'node:child_process'
import type { HyprClient } from './policy'

/** Hyprland IPC lives behind this adapter. Selection and game-mode detection
 *  call the exported helpers; no other layer runs `hyprctl` directly. */
export function readHyprlandVersion(): string {
  return execFileSync('hyprctl', ['-j', 'version'], { encoding: 'utf8', timeout: 1000 })
}

export function readHyprlandClients(): readonly HyprClient[] {
  const output = execFileSync('hyprctl', ['-j', 'clients'], {
    encoding: 'utf8',
    timeout: 750,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return JSON.parse(output) as HyprClient[]
}
