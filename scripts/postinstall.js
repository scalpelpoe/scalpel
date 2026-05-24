// Runs after `npm install`. First applies our native-module source patches
// (patch-package), then wraps electron-rebuild so the build works on
// every supported host:
//   - Linux: newer GCC (14+) promotes -Wincompatible-pointer-types to an
//     error, which trips one of our native-module deps (uiohook-napi).
//     Pass -Wno-error=incompatible-pointer-types via CFLAGS/CXXFLAGS to
//     downgrade it back to a warning so the rebuild completes.
//   - Windows/macOS: invoke electron-rebuild with no extra flags.
//
// The cross-platform npm invocation is what required this script: npm runs
// postinstall via cmd.exe on Windows, which can't parse POSIX shell guards.
const { spawnSync } = require('child_process')

const env = { ...process.env }
if (process.platform === 'linux') {
  const flag = '-Wno-error=incompatible-pointer-types'
  env.CFLAGS = env.CFLAGS ? `${env.CFLAGS} ${flag}` : flag
  env.CXXFLAGS = env.CXXFLAGS ? `${env.CXXFLAGS} ${flag}` : flag
}

// Apply patches to vendored native source (libuiohook XkbGetKeyboard fix, see
// patches/uiohook-napi+1.5.4.patch) BEFORE electron-rebuild compiles them.
// shell: true resolves the .bin shim cross-platform, same as electron-rebuild.
const patch = spawnSync('patch-package', { stdio: 'inherit', shell: true, env })
if ((patch.status ?? 1) !== 0) {
  process.exit(patch.status ?? 1)
}

// shell: true lets Windows resolve node_modules/.bin/electron-rebuild.cmd
// and Linux/macOS find the bare binary on the npm-augmented PATH.
const result = spawnSync('electron-rebuild', {
  stdio: 'inherit',
  shell: true,
  env,
})

process.exit(result.status ?? 1)
