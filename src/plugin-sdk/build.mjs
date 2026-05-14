// Build the publishable artifact for @scalpelpoe/plugin-sdk.
//
// The SDK is a types-only package. At runtime inside Scalpel, the renderer's
// importmap re-routes `@scalpelpoe/plugin-sdk` to scalpel-internal://sdk.js
// (served by Scalpel's main process from out/scalpel-internal/sdk.js). The
// package on npm therefore needs only:
//
//   - dist/index.d.ts  - bundled type declarations (every type a plugin
//                        author can use, inlined from the SDK's transitive
//                        import graph) plus the Window.api ambient.
//   - dist/index.js    - runtime stub. Every value export is a Proxy that
//                        throws with a helpful message if accessed outside
//                        Scalpel (test runners, bundlers that don't honour
//                        the `external` config, etc.). Inside Scalpel, this
//                        file is never loaded because the importmap wins.
//
// Run via `npm run build` from src/plugin-sdk/.

import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, 'dist')

if (existsSync(dist)) rmSync(dist, { recursive: true })
mkdirSync(dist, { recursive: true })

// 1. Bundle declarations. dts-bundle-generator walks the import graph and
//    inlines every reachable type into a single file. tsconfig.build.json
//    scopes the compilation so it doesn't drag in renderer test-only types.
const dtsOut = join(dist, 'index.d.ts')
execSync(
  `npx dts-bundle-generator --no-check --no-banner --project tsconfig.build.json --out-file ${dtsOut} ${join(
    here,
    'src/index.ts',
  )}`,
  { cwd: here, stdio: 'inherit' },
)

// 2. Append the Window.api ambient. dts-bundle-generator drops triple-slash
//    references on bundle, so we manually concat globals.d.ts so consumers
//    get the ambient `window.api` declaration that HotkeyField / HotkeyRecorder
//    / useCurrentZone need to type-check.
const globalsDts = readFileSync(join(here, 'src/globals.d.ts'), 'utf-8')
const bundledDts = readFileSync(dtsOut, 'utf-8')
writeFileSync(dtsOut, `${bundledDts}\n${globalsDts}`)

// 3. Generate the runtime stub from the bundled .d.ts. Pulling the export list
//    from the post-bundle declaration is the single source of truth - any new
//    value export shows up automatically with no second list to maintain.
const valueExports = new Set()
const reBlock = /^export declare (?:function|const|class) (\w+)/gm
let m
while ((m = reBlock.exec(bundledDts))) valueExports.add(m[1])

const stub = `// Auto-generated runtime stub for @scalpelpoe/plugin-sdk.
// Inside Scalpel, the renderer's importmap re-routes this package to
// scalpel-internal://sdk.js so this file never executes. Outside Scalpel
// (tests, dev tools that don't honour build externals), every SDK export
// is a Proxy that throws with a helpful message on access / call / new.

const MESSAGE =
  "@scalpelpoe/plugin-sdk: this package is types-only. The runtime is " +
  "served by Scalpel via importmap (scalpel-internal://sdk.js). " +
  "Externalize '@scalpelpoe/plugin-sdk' in your plugin bundler config."

function __sdkStub(name) {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === '__esModule') return true
      if (prop === 'displayName' || prop === 'name') return name
      if (typeof prop === 'symbol') return undefined
      throw new Error(MESSAGE + " (accessed '" + name + "." + String(prop) + "')")
    },
    apply() {
      throw new Error(MESSAGE + " (called '" + name + "')")
    },
    construct() {
      throw new Error(MESSAGE + " (constructed '" + name + "')")
    },
  })
}

${[...valueExports]
  .sort()
  .map((n) => `export const ${n} = /*#__PURE__*/ __sdkStub('${n}')`)
  .join('\n')}
`
writeFileSync(join(dist, 'index.js'), stub)

// 4. Copy ancillary static assets the published package ships alongside the
//    bundle (CSS tokens, Tailwind preset). Authors reference these from their
//    own build setup (see PLUGINS.md "Design tokens").
for (const name of ['tokens.css', 'tailwind-preset.cjs']) {
  if (existsSync(join(here, name))) copyFileSync(join(here, name), join(dist, name))
}

console.log(`Built @scalpelpoe/plugin-sdk to ${dist}`)
console.log(`  - dist/index.d.ts (${bundledDts.length + globalsDts.length} bytes, ${valueExports.size} value exports)`)
console.log(`  - dist/index.js (runtime stub)`)
