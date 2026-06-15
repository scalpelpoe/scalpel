import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import pkg from './package.json'

const resolveAlias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@main': resolve(__dirname, 'src/main'),
  '@renderer': resolve(__dirname, 'src/renderer/src'),
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: resolveAlias },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: resolveAlias },
  },
  renderer: {
    resolve: { alias: resolveAlias },
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
      rollupOptions: {
        input: {
          overlay: resolve(__dirname, 'src/renderer/index.html'),
          app: resolve(__dirname, 'src/renderer/app.html'),
          cheatSheetsGrid: resolve(__dirname, 'src/renderer/cheat-sheets-grid.html'),
          cheatSheetPreview: resolve(__dirname, 'src/renderer/cheat-sheet-preview.html'),
          secondaryOverlayCanvas: resolve(__dirname, 'src/renderer/secondary-overlay-canvas.html'),
          whiteboard: resolve(__dirname, 'src/renderer/whiteboard.html'),
          regexRemote: resolve(__dirname, 'src/renderer/regex-remote.html'),
          pinnedZone: resolve(__dirname, 'src/renderer/pinned-zone.html'),
          pluginOverlay: resolve(__dirname, 'src/renderer/plugin-overlay.html'),
          pluginAnnotationOverlay: resolve(__dirname, 'src/renderer/plugin-annotation-overlay.html'),
        },
      },
    },
  },
})
