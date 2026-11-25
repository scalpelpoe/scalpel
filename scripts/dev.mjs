import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { devOzoneBootstrap } from '../packages/platform/scripts/dev-ozone.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const passthrough = process.argv.slice(2)
const { args: passthroughArgs, env } = devOzoneBootstrap({
  platform: process.platform,
  passthrough,
  env: process.env,
})
env.SCALPEL_DEBUG_LOG ??= '1'

const args = [join(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'dev']
if (passthroughArgs.length) args.push('--', ...passthroughArgs)

const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env })

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (child.exitCode === null) child.kill(signal)
  })
}
child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
