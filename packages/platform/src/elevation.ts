import { execSync } from 'node:child_process'

/** `net session` succeeds only from an elevated Windows process. */
export function isElevated(): boolean {
  try {
    execSync('net session', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
