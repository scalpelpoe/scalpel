# @scalpelpoe/plugin-sdk

TypeScript SDK for building [Scalpel](https://github.com/scalpelpoe/scalpel) plugins. Provides the `ScalpelPluginContext` type plugins receive at activation, plus a curated set of utility helpers, React hooks, and stateless components Scalpel uses internally.

## Install

```bash
npm install --save-dev @scalpelpoe/plugin-sdk
```

This is a **types-only** npm package. At runtime, the Scalpel app you're loading into serves the actual implementations via its `scalpel-internal://sdk.js` custom protocol (the renderer's importmap reroutes `@scalpelpoe/plugin-sdk` to that URL). The npm tarball ships `dist/index.d.ts` for type-checking + IntelliSense and `dist/index.js` as a runtime stub that throws if anything tries to use it outside Scalpel.

Pin `scalpelMinVersion` in your `manifest.json` to whatever Scalpel version first shipped the API surface you depend on - SDK additions land lockstep with host releases.

## Plugin authoring loop

1. `npm install --save-dev @scalpelpoe/plugin-sdk react react-dom`
2. Write `src/index.tsx` (see [Plugin entry shape](#plugin-entry-shape) below) and a `manifest.json` (schema in [PLUGINS.md](https://github.com/scalpelpoe/scalpel/blob/main/PLUGINS.md)).
3. Vite/Rollup build with `@scalpelpoe/plugin-sdk`, `react`, `react-dom/client`, `react-dom/server`, `react/jsx-runtime` all externalized - see [Build setup](#build-setup-for-plugin-authors).
4. `gh release create v1.0.0 dist/plugin.js dist/manifest.json` on your plugin's repo.
5. Open a PR against [`scalpelpoe/scalpel-plugins-registry`](https://github.com/scalpelpoe/scalpel-plugins-registry) so Scalpel users can install you with one click.

The reference plugin lives at [`scalpelpoe/scalpel-plugin-examples`](https://github.com/scalpelpoe/scalpel-plugin-examples).

## Plugin entry shape

```ts
import type { ScalpelPluginContext } from '@scalpelpoe/plugin-sdk'

export default async function activate(ctx: ScalpelPluginContext): Promise<void> {
  ctx.registerTab({
    label: 'My plugin',
    icon: '<svg>...</svg>',
    render: (container) => {
      // mount your React (or anything) tree into container
      return () => {
        // optional cleanup on unmount
      }
    },
  })
}
```

## What's exported

**Types:** `ScalpelPluginContext`, `PluginActivate`, `PluginManifest`, `RegisterTabOptions`, `RegisterHotkeyOptions`, `PluginStorage`.

**Item helpers:** `isClusterJewel`, `isSkillGem`, `SKILL_GEM_CLASSES`, `defaultPoeItem`.

**External URL builders:** `externalLinkUrl` (wiki/poedb), `ninjaLinkUrl`, `deriveItemVariant`, `ninjaLeagueSegment`.

**Formatting:** `formatPrice`, `formatDust`.

**Versions:** `compareVersions`, `versionMatches`.

**Game features:** `getGameFeatures`, `GameFeatures` type.

**Trend:** `getTrendDirection`, `TREND_UP_COLOR`, `TREND_DOWN_COLOR`, `TREND_THRESHOLD_PCT`.

**Zones:** `isTownOrHideout`, `useCurrentZone`.

**Item economy:** `getDustInfo`, `findRelated`, `RARITY_COLORS`.

**Stateless components:** `<Toggle>`, `<Notice>`, `<ErrorBanner>`.

## Design tokens for dev environments

Plugins running inside Scalpel inherit CSS variables (`--bg`, `--accent`, `--text`, etc.) from the renderer DOM tree, so the forwarded components render with the correct theme without any extra setup.

For dev environments outside Scalpel (Storybook, isolated unit tests, etc.):

```css
@import '@scalpelpoe/plugin-sdk/tokens.css';
```

And for Tailwind users:

```js
// tailwind.config.js
const scalpelPreset = require('@scalpelpoe/plugin-sdk/tailwind-preset.cjs')
module.exports = {
  presets: [scalpelPreset],
  content: ['./src/**/*.{ts,tsx}'],
}
```

## Build setup for plugin authors

Plugin authors use their own bundler (Vite recommended). Externalize the SDK and React specifiers so Scalpel's runtime provides them at activation:

```js
// vite.config.ts
build: {
  rollupOptions: {
    external: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-dom/server',
      'react/jsx-runtime',
      '@scalpelpoe/plugin-sdk',
    ],
  },
}
```

If you forget to externalize any of these, two things go wrong: your `plugin.js` balloons by hundreds of KB, and Scalpel's React instance won't match yours (hooks crash with `useContext` returning null). The reference plugin's `vite.config.ts` shows the working shape.

A working starter template lives at [`scalpelpoe/scalpel-plugin-examples`](https://github.com/scalpelpoe/scalpel-plugin-examples).
