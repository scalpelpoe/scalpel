import { resolve } from 'node:path'
import type { StorybookConfig } from '@storybook/react-vite'

/** Storybook config for the renderer. Stories live next to the components they
 *  document so they get picked up by IDE refactors automatically. The catalog
 *  stays small and curated -- not every component needs a story, only the ones
 *  whose visual state we want to iterate on without spinning up the full overlay
 *  flow. */
const config: StorybookConfig = {
  stories: ['../src/renderer/src/**/*.stories.@(ts|tsx)'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  addons: [],
  /** Dedupe react/react-dom so Storybook's prebundled deps (including zustand,
   *  which calls React hooks via useSyncExternalStore) resolve to the same
   *  React instance the stories' components use. Without this, zustand picks
   *  up a separate React copy from the optimizeDeps cache and every hook call
   *  fails with "Cannot read properties of null (reading 'useRef')." */
  viteFinal: async (config) => {
    config.resolve = config.resolve ?? {}
    const dedupe = new Set([...(config.resolve.dedupe ?? []), 'react', 'react-dom'])
    config.resolve.dedupe = Array.from(dedupe)
    // Mirror electron.vite.config.ts's path aliases; without them any story that
    // (transitively) imports via @renderer/@shared/@main breaks Vite's dep scan
    // and Storybook renders "No Preview" for every story.
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@shared': resolve(process.cwd(), 'src/shared'),
      '@main': resolve(process.cwd(), 'src/main'),
      '@renderer': resolve(process.cwd(), 'src/renderer/src'),
    }
    return config
  },
}

export default config
