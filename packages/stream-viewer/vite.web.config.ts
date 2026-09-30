import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viewerShared } from './vite.shared'

// Public gear page and OBS view (live.scalpel.fourth.party). One SPA; the path
// picks the view (see src/entries/routes.ts). `--mode localapi` (npm run
// dev:web:local) points it at `wrangler dev` of scalpel-stream-api.
export default defineConfig(({ mode }) => ({
  root: resolve(__dirname, 'web'),
  base: '/',
  plugins: [react()],
  ...viewerShared,
  define:
    mode === 'localapi' ? { 'import.meta.env.VITE_STREAM_API': JSON.stringify('http://127.0.0.1:8787') } : {},
  build: {
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
  },
}))
