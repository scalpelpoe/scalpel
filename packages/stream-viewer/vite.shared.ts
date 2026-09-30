import { resolve } from 'node:path'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'
import type { UserConfig } from 'vite'

/** Resolution and CSS shared by the extension and web builds. */
export const viewerShared: Pick<UserConfig, 'resolve' | 'css'> = {
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      // Pages reference their entry as "/src/entries/..."; map that onto this package's src
      // so it resolves in dev (deep SPA paths like /p/<id>) as well as in the build.
      { find: /^\/src\//, replacement: `${resolve(__dirname, 'src')}/` },
      // Scalpel's own stylesheet, components and theme engine.
      { find: '@renderer', replacement: resolve(__dirname, '../../src/renderer/src') },
      { find: '@shared', replacement: resolve(__dirname, '../../src/shared') },
    ],
  },
  css: {
    postcss: { plugins: [tailwindcss({ config: resolve(__dirname, 'tailwind.config.cjs') }), autoprefixer()] },
  },
}
