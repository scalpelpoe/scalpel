# @scalpelpoe/plugin-sdk

TypeScript SDK for building [Scalpel](https://github.com/scalpelpoe/scalpel) plugins. Provides the `ScalpelPluginContext` type plugins receive at activation, plus a curated set of utility helpers, React hooks, and stateless components Scalpel uses internally.

## Install

```bash
npm install --save-dev @scalpelpoe/plugin-sdk
```

The renderer import remains host-provided: Scalpel serves it through `scalpel-internal://sdk.js`, while `dist/index.js` is a protective stub outside the app. The npm package also ships the real Node-only `scalpel-plugin` authoring CLI.

Pin `scalpelMinVersion` in your `manifest.json` to whatever Scalpel version first shipped the API surface you depend on - SDK additions land lockstep with host releases.

## Plugin authoring loop

1. `npm install --save-dev @scalpelpoe/plugin-sdk @bufbuild/buf @bufbuild/protoc-gen-es react react-dom` and `npm install @bufbuild/protobuf` when using services.
2. Write `src/index.tsx` (see [Plugin entry shape](#plugin-entry-shape) below) and a `manifest.json` (schema in [PLUGINS.md](https://github.com/scalpelpoe/scalpel/blob/main/PLUGINS.md)).
3. Run `scalpel-plugin pack`; service contracts and generated sources are configured under `scalpelPlugin` in `package.json`.
4. Attach every file under `dist/` to the matching GitHub release.
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

**Types:** `ScalpelPluginContext`, `PluginActivate`, `PluginManifest`, `PluginServiceClient`, `PluginServiceImplementation`, `RegisterTabOptions`, `RegisterHotkeyOptions`, `RegisterOverlayOptions`, `PluginStorage`.

**Protobuf services:** `exposePluginService`, `getPluginServiceClient`, `createPluginServiceClient`, `createNativeServiceClient`.

**Item helpers:** `isClusterJewel`, `isSkillGem`, `SKILL_GEM_CLASSES`, `defaultPoeItem`.

**External URL builders:** `externalLinkUrl` (wiki/poedb), `ninjaLinkUrl`, `deriveItemVariant`, `ninjaLeagueSegment`.

**Formatting:** `formatPrice`, `formatDust`.

**Versions:** `compareVersions`, `versionMatches`.

**Game features:** `getGameFeatures`, `GameFeatures` type.

**Trend:** `getTrendDirection`, `TREND_UP_COLOR`, `TREND_DOWN_COLOR`, `TREND_THRESHOLD_PCT`.

**Zones:** `isTownOrHideout`, `useCurrentZone`.

**Item economy:** `getDustInfo`, `findRelated`, `RARITY_COLORS`.

**Item tiers:** `ModTier`, `TierLadder`, `TierStat` types (an affix's tier-ladder shape: tier number, roll range, required level).

**Stateless components:** `<Toggle>`, `<Notice>`, `<ErrorBanner>`.

## Log tail and overlay windows

Beyond a tab, the context also exposes the raw `Client.txt` log tail (`onLogLine`, `getRecentLogLines` - note the log includes chat and whispers) and a separate chrome'd overlay window (`registerOverlay`, `openOverlay`, `closeOverlay`). The overlay `render` runs in its own renderer process, so keep `activate` idempotent. See the "Reading the game log" and "Overlay windows" sections in [PLUGINS.md](../../PLUGINS.md) for the full guide.

It also exposes `ctx.gameConfig` (`read` / `write` / `onChange`) for the running game's `_Config.ini`. The host resolves the path from the detected PoE version, so a plugin never names a path and this is the only file it can touch on disk. First write of a session leaves a timestamped `.bak`. See "Editing the game config" in [PLUGINS.md](../../PLUGINS.md).

`ctx.prices` gives read-only access to the poe.ninja snapshot Scalpel already maintains (the same data behind Price Check). The host owns fetching - a plugin never calls ninja directly because a renderer fetch is CORS-blocked.

```tsx
const { prices, updatedAt } = await ctx.prices.getPrices({ category: 'currency' })
// prices: { name, category, chaosValue, divineValue?, graph? }[]
// updatedAt: epoch-ms of last successful fetch, or null

const off = ctx.prices.onChange(async () => {
  const fresh = await ctx.prices.getPrices({ category: 'currency' })
  // re-render with fresh.prices
})

await ctx.prices.refresh() // force a refetch, bypassing the host cache TTL
```

`chaosValue` is the baseline-equivalent count (chaos in PoE1, exalt in PoE2). `category === 'currency'` is guaranteed to return currency orbs in both games. See "Reading economy prices" in [PLUGINS.md](../../PLUGINS.md) for the full reference.

`ctx.media` reads what Windows is currently playing (Spotify, a browser tab, any player registered with the system media controls) and sends transport commands via the system media keys - no account or player-specific API involved.

```tsx
const session = await ctx.media.getSession()
// { sourceAppId, title, artist, album, thumbnail, playing, position, duration, positionAt } or null

const off = ctx.media.onChange((session) => {
  // fires with the full new state on track / play-pause / timeline changes
})

ctx.media.playPause() // also next() / previous()
```

`thumbnail` is a ready-to-use `data:` URL of the album art (or null). Windows only: on Linux `getSession` resolves null and the commands are no-ops. See "Now playing" in [PLUGINS.md](../../PLUGINS.md).

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

The recommended path is the SDK CLI:

```bash
npx scalpel-plugin generate
npx scalpel-plugin check
npx scalpel-plugin build
npx scalpel-plugin pack
```

It generates standard Protobuf-ES sources and descriptor sets, bundles the renderer, and packages native artifacts. See `PLUGIN_SERVICES.md` for configuration and examples.

For custom build pipelines, externalize the host SDK and React specifiers:

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
