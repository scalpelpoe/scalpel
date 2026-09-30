import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viewerShared } from './vite.shared'

// Twitch extension bundle. Twitch serves the zip from its CDN under a hashed
// path, so everything is relative (base './'), and review wants readable JS,
// so nothing is minified. The Twitch helper stays a plain <script> in each page.
export default defineConfig({
  root: resolve(__dirname, 'extension'),
  base: './',
  plugins: [react()],
  ...viewerShared,
  build: {
    outDir: resolve(__dirname, 'dist/extension'),
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: {
        video_overlay: resolve(__dirname, 'extension/video_overlay.html'),
        mobile: resolve(__dirname, 'extension/mobile.html'),
        panel: resolve(__dirname, 'extension/panel.html'),
        config: resolve(__dirname, 'extension/config.html'),
      },
    },
  },
})
