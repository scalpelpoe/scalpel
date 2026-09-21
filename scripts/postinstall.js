// Runs after `npm install`. First applies our native-module source patches
// (patch-package), then wraps electron-rebuild so the build works on
// every supported host:
//   - Linux: newer GCC (14+) promotes -Wincompatible-pointer-types to an
//     error, which trips one of our native-module deps (uiohook-napi).
//     Pass -Wno-error=incompatible-pointer-types via CFLAGS/CXXFLAGS to
//     downgrade it back to a warning so the rebuild completes. Linux also
//     force-rebuilds uiohook-napi from the patched source (see the block
//     below) since its N-API prebuilt would otherwise mask the patch.
//   - Windows/macOS: invoke electron-rebuild with no extra flags.
//
// The cross-platform npm invocation is what required this script: npm runs
// postinstall via cmd.exe on Windows, which can't parse POSIX shell guards.
const { spawnSync } = require('node:child_process')
const { rmSync } = require('node:fs')

const env = { ...process.env }

// Compile Paraglide messages into src/shared/paraglide/ (gitignored, auto-generated).
// Runs here so a fresh checkout has the i18n runtime before the husky pre-commit
// hook (tsc + vitest, which do NOT run `npm run build`) ever needs to import it.
const i18n = spawnSync(
  'paraglide-js',
  ['compile', '--project', './project.inlang', '--outdir', './src/shared/paraglide'],
  { stdio: 'inherit', shell: true, env },
)
if ((i18n.status ?? 1) !== 0) {
  process.exit(i18n.status ?? 1)
}

if (process.platform === 'linux') {
  const flag = '-Wno-error=incompatible-pointer-types'
  env.CFLAGS = env.CFLAGS ? `${env.CFLAGS} ${flag}` : flag
  env.CXXFLAGS = env.CXXFLAGS ? `${env.CXXFLAGS} ${flag}` : flag
}

// Apply patches to vendored native source (libuiohook XkbGetKeyboard fix, see
// patches/uiohook-napi+1.5.4.patch) BEFORE electron-rebuild compiles them.
// shell: true resolves the .bin shim cross-platform, same as electron-rebuild.
const patch = spawnSync('patch-package', { stdio: 'inherit', shell: true, env })
const patchStatus = patch.status ?? 1
if (patchStatus !== 0) {
  process.exit(patchStatus)
}

// shell: true lets Windows resolve node_modules/.bin/electron-rebuild.cmd
// and Linux/macOS find the bare binary on the npm-augmented PATH.
const result = spawnSync('electron-rebuild', {
  stdio: 'inherit',
  shell: true,
  env,
})
const rebuildStatus = result.status ?? 1
if (rebuildStatus !== 0) {
  process.exit(rebuildStatus)
}

// uiohook-napi ships an ABI-stable N-API prebuilt, so electron-rebuild leaves it
// untouched and the patched libuiohook source (patches/uiohook-napi+1.5.4.patch)
// never compiles. Only Linux needs the patch, so there: drop the prebuilt and
// force a from-source rebuild, making the patched build/Release the binary
// node-gyp-build loads. (Fail loud rather than silently shipping the unpatched
// prebuilt.)
if (process.platform === 'linux') {
  rmSync('node_modules/uiohook-napi/prebuilds', { recursive: true, force: true })
  const forced = spawnSync('electron-rebuild', ['-f', '-o', 'uiohook-napi'], {
    stdio: 'inherit',
    shell: true,
    env,
  })
  process.exit(forced.status ?? 1)
}

process.exit(0)
