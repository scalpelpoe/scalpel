# @filterscalpel/plugin-sdk

TypeScript SDK for building Scalpel plugins. Provides the `ScalpelPluginContext` type plugins receive at activation, plus a curated set of utility helpers, React hooks, and stateless components Scalpel uses internally.

## Plugin entry shape

```ts
import type { ScalpelPluginContext } from '@filterscalpel/plugin-sdk'

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
@import '@filterscalpel/plugin-sdk/tokens.css';
```

And for Tailwind users:

```js
// tailwind.config.js
const scalpelPreset = require('@filterscalpel/plugin-sdk/tailwind-preset.cjs')
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
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@filterscalpel/plugin-sdk'],
  },
}
```

A working starter template lives at `examples/scalpel-plugins/hello-world/`.
