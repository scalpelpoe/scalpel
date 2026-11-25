// Runs after `npm install`. First applies our native-module source patches
// (patch-package), then wraps electron-rebuild so the build works on
// every supported host:
//   - Linux: newer GCC (14+) promotes -Wincompatible-pointer-types to an
//     error, which trips one of our native-module deps (uiohook-napi).
//     Pass -Wno-error=incompatible-pointer-types via CFLAGS/CXXFLAGS to
//     downgrade it back to a warning so the rebuild completes. Linux also
//     force-rebuilds uiohook-napi from the patched source (see the block
//     below) since its N-API prebuilt would otherwise mask the patch.
//   - Linux: also build the separate `overlay-wayland-host` executable from the
//     same binding.gyp, which electron-rebuild does not build on its own.
//   - Windows/macOS: invoke electron-rebuild with no extra flags.
//
// The cross-platform npm invocation is what required this script: npm runs
// postinstall via cmd.exe on Windows, which can't parse POSIX shell guards.
const { spawnSync } = require('node:child_process')
const { existsSync, readFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')

const env = { ...process.env }

// electron-rebuild only builds the addon target when its configure step cannot
// find the Wayland development packages. The generic layer-shell backend needs
// the separate `overlay-wayland-host` executable, so build that target
// explicitly whenever the toolchain is available. Without it, native Wayland
// silently falls back to the X11 path and the overlay lands on the wrong screen.
function buildWaylandHost() {
  const moduleDir = join('node_modules', 'electron-overlay-window')
  const configPath = join(moduleDir, 'build', 'config.gypi')
  if (!existsSync(configPath)) {
    console.warn('[postinstall] electron-overlay-window config.gypi missing; layer-shell host not built')
    return
  }

  const scanner = spawnSync('sh', ['-c', 'command -v wayland-scanner >/dev/null 2>&1'], { stdio: 'ignore' })
  const libraries = spawnSync(
    'sh',
    ['-c', 'pkg-config --exists wayland-client wayland-cursor xkbcommon'],
    { stdio: 'ignore' },
  )
  if (scanner.status !== 0 || libraries.status !== 0) {
    const missing = [
      ...(scanner.status !== 0 ? ['wayland-scanner on PATH'] : []),
      ...(libraries.status !== 0 ? ['wayland-client/wayland-cursor/xkbcommon dev packages'] : []),
    ]
    console.warn(
      `[postinstall] ${missing.join(' and ')} not found; layer-shell host not built. ` +
        'Rerun npm ci from a shell with the Wayland toolchain available.',
    )
    return
  }

  // config.gypi starts with a `# Do not edit` comment, so strip comment lines.
  const gypConfig = readFileSync(configPath, 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
  const { variables = {} } = JSON.parse(gypConfig)
  const gypArgs = []
  if (variables.nodedir) gypArgs.push(`--nodedir=${variables.nodedir}`)
  if (variables.target) gypArgs.push(`--target=${variables.target}`)

  // node-gyp's nopt parser drops unknown flags before gyp sees them, so
  // `--wayland_host=1` silently does nothing. GYP_DEFINES is passed straight to
  // gyp and reliably forces the host target on.
  const configureEnv = {
    ...env,
    GYP_DEFINES: `${env.GYP_DEFINES ?? ''} wayland_host=1`.trim(),
  }
  const configured = spawnSync('node-gyp', ['configure', ...gypArgs], {
    cwd: moduleDir,
    stdio: 'inherit',
    shell: true,
    env: configureEnv,
  })
  if ((configured.status ?? 1) !== 0) {
    console.warn('[postinstall] node-gyp configure for layer-shell host failed')
    return
  }

  const built = spawnSync('node-gyp', ['build', ...gypArgs], {
    cwd: moduleDir,
    stdio: 'inherit',
    shell: true,
    env,
  })
  if ((built.status ?? 1) !== 0) {
    console.warn('[postinstall] layer-shell host build failed; native Wayland overlays unavailable')
  }
}

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

if (process.platform === 'linux') buildWaylandHost()

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
