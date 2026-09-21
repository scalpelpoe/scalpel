import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (process.platform !== 'linux' || !process.env.DISPLAY) {
  throw new Error('Run on Linux with DISPLAY pointing to X11/XWayland or Xvfb.')
}

const temp = mkdtempSync(join(tmpdir(), 'scalpel-shutdown-'))
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', timeout: 30_000, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.signal || result.status})`)
}

try {
  const binary = join(temp, 'shutdown-test')
  const source = 'node_modules/electron-overlay-window/src/lib'
  run('cc', [
    '-D_GNU_SOURCE', '-std=c11', '-g', '-fsanitize=address,undefined',
    '-I', source, 'scripts/test-linux-shutdown.c', `${source}/x11.c`,
    '-Wl,--wrap=xcb_connect', '-Wl,--wrap=xcb_disconnect', '-Wl,--wrap=xcb_poll_for_event',
    '-lxcb', '-luv', '-pthread', '-o', binary,
  ])
  run(binary, [])
  // A worker that fails to connect must also be safe to join and clean up.
  run(binary, [], { env: { ...process.env, DISPLAY: '' } })
} finally {
  rmSync(temp, { recursive: true, force: true })
}
