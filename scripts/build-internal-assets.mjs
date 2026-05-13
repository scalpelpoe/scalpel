// Build the modules that Scalpel injects into plugins via the
// scalpel-internal:// protocol. Each output is a single-file ESM bundle.
//
// Outputs go to out/scalpel-internal/ (dev) and resources/scalpel-internal/ (packaged).
// The protocol handler resolves the path based on app.isPackaged.
//
// Run via: node scripts/build-internal-assets.mjs

import { build } from 'esbuild'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const outDir = join(root, 'out', 'scalpel-internal')

mkdirSync(outDir, { recursive: true })

const common = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  outdir: outDir,
  define: { 'process.env.NODE_ENV': '"production"' },
}

// SDK runtime. Using the object form so output filename is sdk.js (not index.js).
await build({
  ...common,
  entryPoints: { sdk: join(root, 'src', 'plugin-sdk', 'src', 'index.ts') },
  loader: { '.ts': 'ts' },
  // The SDK now re-exports React hooks (e.g. useCurrentZone). Externalize the
  // React specifiers so esbuild leaves them as bare imports; the renderer's
  // importmap resolves them all to scalpel-internal://react.js, the single
  // unified bundle. Without this, esbuild would inline a second React copy
  // into sdk.js and createRoot's hook dispatcher (set by the renderer's
  // React instance) would not match the SDK's React.useState references.
  external: ['react', 'react-dom/client', 'react/jsx-runtime'],
})

// React + react-dom/client + react/jsx-runtime are CommonJS. Esbuild's CJS-to-ESM
// converter emits a single `default` export for these, which breaks plugin
// authors writing `import { createRoot } from 'react-dom/client'`. The shims
// under scripts/internal-shims/ re-export named bindings explicitly so the
// bundles ship proper ESM named exports.
const shimsDir = join(root, 'scripts', 'internal-shims')

// Single unified bundle for React + react-dom/client + react/jsx-runtime.
// The importmap aliases all three specifiers to scalpel-internal://react.js
// so the browser fetches this bundle once and plugins share a single React
// instance with createRoot's hook dispatcher. Splitting into separate bundles
// either duplicates React (hooks fail) or emits a __require stub esbuild
// can't satisfy at runtime.
await build({
  ...common,
  entryPoints: { react: join(shimsDir, 'react.js') },
})

console.log('Built scalpel-internal assets in', outDir)
