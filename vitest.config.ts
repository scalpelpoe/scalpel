import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@main': resolve(__dirname, 'src/main'),
    },
  },
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.mjs'],
    exclude: ['node_modules', 'out', 'dist'],
    passWithNoTests: true,
    environmentMatchGlobs: [
      ['src/renderer/**/*.test.tsx', 'jsdom'],
      ['src/**/*.test.ts', 'node'],
      ['scripts/**/*.test.mjs', 'node'],
    ],
    setupFiles: ['src/renderer/test-setup.ts'],
  },
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.svg'],
})
