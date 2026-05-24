// Runs after `npm install`. Wraps electron-rebuild so the build works on
// every supported host:
//   - Linux: newer GCC (14+) promotes -Wincompatible-pointer-types to an
//     error, which trips one of our native-module deps (uiohook-napi).
//     Pass -Wno-error=incompatible-pointer-types via CFLAGS/CXXFLAGS to
//     downgrade it back to a warning so the rebuild completes.
//   - Windows/macOS: invoke electron-rebuild with no extra flags.
//
// The cross-platform npm invocation is what required this script: npm runs
// postinstall via cmd.exe on Windows, which can't parse POSIX shell guards.
const { spawnSync } = require('node:child_process')

const env = { ...process.env }
if (process.platform === 'linux') {
  const flag = '-Wno-error=incompatible-pointer-types'
  env.CFLAGS = env.CFLAGS ? `${env.CFLAGS} ${flag}` : flag
  env.CXXFLAGS = env.CXXFLAGS ? `${env.CXXFLAGS} ${flag}` : flag
}

// shell: true lets Windows resolve node_modules/.bin/electron-rebuild.cmd
// and Linux/macOS find the bare binary on the npm-augmented PATH.
const result = spawnSync('electron-rebuild', {
  stdio: 'inherit',
  shell: true,
  env,
})

process.exit(result.status ?? 1)
