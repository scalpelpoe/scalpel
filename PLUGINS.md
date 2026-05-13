# Writing Scalpel plugins

Scalpel supports third-party plugins that show up as new tabs in the overlay. A plugin is a single bundled JavaScript file you author against a typed SDK, distributed via your own GitHub repository, and discovered through a curated registry. This document is for plugin authors.

The reference plugin lives at [`examples/scalpel-plugins/hello-world`](examples/scalpel-plugins/hello-world). Read it alongside this doc.

## What you can build

A plugin can:

- Render arbitrary UI in its own tab (React, vanilla DOM, anything that runs in a browser)
- React to the player's most recent hotkey'd item, current zone, and league
- Register a hotkey that the user binds in Scalpel's existing Macros settings
- Persist its own settings to disk
- Call out to the internet (poe.ninja, your own backend, etc.)
- Use Scalpel's helpers for item identity, URL building, formatting, and rendering

A plugin can NOT (because Scalpel doesn't expose the APIs):

- Read Scalpel's loaded filter, audit data, or settings beyond its own storage
- Modify or read other plugins' state
- Affect the built-in tabs

Plugins run with **full renderer privileges**. The safety story is procedural: only install plugins from authors you trust, the registry is curated, and updates are manual.

## Quickstart

The fastest path is to fork the reference plugin:

```bash
# Clone Scalpel
git clone https://github.com/scalpelpoe/scalpel.git
cd scalpel/examples/scalpel-plugins/hello-world

# Or copy hello-world/ into your own repo as a starting point
cp -r examples/scalpel-plugins/hello-world ~/my-scalpel-plugin
cd ~/my-scalpel-plugin

npm install
npm run build
```

Then load it into Scalpel for testing (see [Local testing](#local-testing) below).

## Plugin entry point

Your `src/index.tsx` exports a default function Scalpel calls once on startup:

```tsx
import type { ScalpelPluginContext } from '@filterscalpel/plugin-sdk'

export default function activate(ctx: ScalpelPluginContext): void {
  ctx.registerTab({
    label: 'My plugin',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16">...</svg>',
    render: (container) => {
      // Mount your UI into `container`. Return a cleanup function if you need one.
      container.innerHTML = '<div>Hello from a plugin!</div>'
      return () => {
        container.innerHTML = ''
      }
    },
  })
}
```

`activate` can be `async` if you need to wait for storage reads before registering anything.

### The context object

`ctx` is the only thing Scalpel hands you. Everything plugins can do goes through it.

```ts
interface ScalpelPluginContext {
  // Identity
  pluginId: string
  pluginVersion: string

  // Game state
  getPoeVersion(): 1 | 2
  getLeague(): string
  getCurrentItem(): PoeItem | null   // the most recent hotkey'd item
  getCurrentZone(): Zone | null      // raw current zone

  // Event subscriptions (each returns an unsubscribe function)
  onCurrentItem(handler: (item: PoeItem) => void): () => void
  onCurrentZone(handler: (zone: Zone) => void): () => void
  onLeagueChange(handler: (league: string) => void): () => void

  // Tab registration (call exactly once)
  registerTab(opts: {
    label: string
    icon: string                       // inline SVG string or data URL
    render: (container: HTMLElement) => (() => void) | void
  }): void

  // Hotkey registration (call at most once)
  // Surfaces in Settings > Macros > Plugin Hotkeys; the user binds the key.
  registerHotkey(opts: { label: string }, handler: () => void): void

  // Per-plugin namespaced storage, persisted to disk
  storage: {
    get<T = unknown>(key: string): Promise<T | null>
    set<T = unknown>(key: string, value: T): Promise<void>
    delete(key: string): Promise<void>
    keys(): Promise<string[]>
  }

  // Utilities
  fetch: typeof fetch                  // standard browser fetch
  openExternal(url: string): void      // open URL in system browser
  log(...args: unknown[]): void        // gated on SCALPEL_DEBUG_LOG
}
```

## Forwarded helpers, hooks, and components

The SDK re-exports utilities Scalpel uses internally so you don't have to reimplement them. Import any of these from `@filterscalpel/plugin-sdk`:

**Item identity**

- `isClusterJewel(item)` - true for cluster jewels (vs other Jewels)
- `isSkillGem(item)` - true for any gem class across PoE1 and PoE2
- `SKILL_GEM_CLASSES` - the underlying set
- `defaultPoeItem(overrides, version)` - build a synthetic `PoeItem`

**External URLs**

- `externalLinkUrl(target, item, version)` - poewiki / poe2wiki / poedb URL
- `ninjaLinkUrl(item, version, league, leagueSlugMap, priceInfo?)` - poe.ninja deep link
- `deriveItemVariant(item)` - variant string ninja uses to disambiguate

**Formatting**

- `formatPrice(value)` - "1.5k" / "23" / "0.5"
- `formatDust(value)` - "1.5m" / "300k"

**Economy**

- `getDustInfo(item)` - dust value for a unique, including bonuses
- `findRelated(itemName)` - curated related-items list lookup
- `RARITY_COLORS` - hex tokens for rarity text colors

**Trend**

- `getTrendDirection(graph)` - `'up' | 'down' | 'flat'` from a 7-day percent-change array
- `TREND_UP_COLOR`, `TREND_DOWN_COLOR`, `TREND_THRESHOLD_PCT`

**Game features / version**

- `getGameFeatures(version)` - per-game feature flags
- `compareVersions(a, b)`, `versionMatches(entry, current)`

**Area helpers**

- `isTownOrHideout(areaCode, version)`

**React hooks**

- `useCurrentZone()` - subscribes to zone-change events; returns the current `Zone | null`

**Stateless React components**

- `<Toggle checked onChange disabled? />`
- `<Notice icon title body />`
- `<ErrorBanner message tone />`

**Types**

- `ScalpelPluginContext`, `PluginActivate`, `PluginManifest`
- `RegisterTabOptions`, `RegisterHotkeyOptions`, `PluginStorage`
- `PoeItem`, `Zone`, `RelatedRef`, `RelatedEntry`, `GameFeatures`, `TrendDirection`

## Project setup

Your plugin is a standalone npm project. The `vite.config.ts` in the reference plugin shows the required shape:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      formats: ['es'],
      fileName: () => 'plugin.js',
    },
    rollupOptions: {
      // Scalpel provides these at runtime via importmap.
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@filterscalpel/plugin-sdk'],
    },
    minify: 'esbuild',
    sourcemap: true,
  },
})
```

Externalize React and the SDK - Scalpel injects them at runtime via a custom protocol. If you bundle your own React, hooks will silently fail because your `useState` and Scalpel's `createRoot` will point at different React instances.

### About SDK types

The SDK package (`@filterscalpel/plugin-sdk`) is not on npm yet. The reference plugin treats SDK imports as untyped (TypeScript falls back to `any` for the bare specifier). Three workarounds while we sort out publishing:

1. **Match the reference plugin** - no tsconfig, accept `any` for SDK types. Simplest, ships fastest.
2. **Local file dep** - clone Scalpel locally and reference the SDK source:
   ```json
   "devDependencies": {
     "@filterscalpel/plugin-sdk": "file:../scalpel/src/plugin-sdk"
   }
   ```
3. **Copy the types** - pull `src/plugin-sdk/src/types.ts` from Scalpel into your repo as `types/scalpel-plugin-sdk.d.ts`.

We'll publish a proper npm package once the API has shipped to enough users to feel stable.

### Design tokens

Plugins running inside Scalpel inherit CSS variables (`--accent`, `--text`, `--bg`, etc.) from Scalpel's stylesheet automatically. Use them directly in inline styles or className utilities:

```tsx
<div style={{ color: 'var(--text)', background: 'var(--bg-card)' }}>...</div>
```

For dev environments outside Scalpel (Storybook, isolated component tests), import the static token file:

```css
@import '@filterscalpel/plugin-sdk/tokens.css';
```

If you use Tailwind in your plugin's build pipeline, extend your config with Scalpel's preset to get utility classes mapped to the design tokens:

```js
// tailwind.config.js
const scalpelPreset = require('@filterscalpel/plugin-sdk/tailwind-preset.cjs')
module.exports = {
  presets: [scalpelPreset],
  content: ['./src/**/*.{ts,tsx}'],
}
```

## The manifest

Every plugin ships a `manifest.json` alongside its `plugin.js`. The schema:

```json
{
  "manifestVersion": 1,
  "id": "jewel-economy",
  "version": "1.0.0",
  "name": "Jewel Economy",
  "description": "Explore jewel pricing and lab-farming math.",
  "author": "your-github-username",
  "homepage": "https://github.com/you/your-plugin",
  "scalpelMinVersion": ">=0.20.0",
  "poeVersions": [1, 2],
  "tabIcon": "icon.svg"
}
```

Field notes:

- `id` must match `^[a-z][a-z0-9-]{2,49}$` and matches the directory name in `userData/plugins/<id>/`.
- `version` is your plugin's own version, separate from `manifestVersion` (the manifest schema version, currently 1).
- `scalpelMinVersion` is a comparator expression (`">=0.20.0"`, `">=0.18 <1.0"`). If the running Scalpel doesn't satisfy it, the plugin won't load.
- `poeVersions` gates which games the plugin appears under. Omit for both.
- `tabIcon` is optional; you can also pass an inline SVG string via `registerTab({ icon })`.

## Local testing

While developing, skip the registry and install your plugin directly.

**Option 1: "Load unpacked" button** (Scalpel ≥ this version)

1. In Scalpel, open Settings → Developer.
2. Toggle "Developer mode" on.
3. Click "Load unpacked plugin..." and pick the directory containing your built `plugin.js` and `manifest.json`.
4. Restart Scalpel. Your tab appears in the title bar.

**Option 2: Manual file copy**

1. Find your Scalpel `userData` folder:
   - Windows: `%APPDATA%\Scalpel`
   - macOS: `~/Library/Application Support/Scalpel`
   - Linux: `~/.config/Scalpel`
2. Create `userData/plugins/<your-id>/` and copy `dist/plugin.js` + `dist/manifest.json` into it.
3. Edit `userData/plugins/installed.json` to include your id: `["your-id"]`.
4. Restart Scalpel.

## Publishing

Releases are GitHub-driven. Tag your repo with `v<version>` matching your manifest's `version`, and attach the built artifacts:

1. `npm run build` produces `dist/plugin.js` and copies `dist/manifest.json`.
2. Tag and release on GitHub:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. On the GitHub release page, attach `dist/plugin.js` and `dist/manifest.json` as release assets.

Scalpel downloads files from `https://github.com/<your-repo>/releases/download/v<version>/<file>`, so the version tag and asset filenames must match exactly.

## Listing in the registry

Once your plugin has a working release, open a pull request against [`filterscalpel/scalpel-plugins-registry`](https://github.com/filterscalpel/scalpel-plugins-registry) adding an entry to `registry.json`:

```json
{
  "id": "jewel-economy",
  "name": "Jewel Economy",
  "author": "your-github-username",
  "description": "Explore jewel pricing and lab-farming math.",
  "repo": "your-github-username/scalpel-plugin-jewel-economy",
  "latestVersion": "1.0.0",
  "scalpelMinVersion": ">=0.20.0",
  "poeVersions": [1, 2],
  "iconUrl": "https://raw.githubusercontent.com/your-user/your-plugin/main/icon.png",
  "homepage": "https://github.com/your-user/your-plugin"
}
```

After the PR merges, Scalpel users see your plugin in Settings → Plugins → Browse with a one-click Install button.

To publish an update: bump `version` in your `manifest.json`, cut a new tag, attach the artifacts to the new release, and update `latestVersion` in `registry.json` via another PR.

## Versioning policy

The SDK is treated as a stable public API. Additions are non-breaking; changes to existing exports are semver-major events for Scalpel.

`scalpelMinVersion` in your manifest is the contract. Pin to the lowest Scalpel version your plugin actually needs - newer Scalpels will satisfy any range that includes them.

Scalpel relaunches the process on PoE version switch, so plugin state doesn't survive game switches. Don't rely on hooks that span versions.

## What plugins should not do

- **Don't bundle React.** It must come from Scalpel via the importmap; otherwise hooks break.
- **Don't read other plugins' storage.** Use your own namespaced `ctx.storage`.
- **Don't reach into Scalpel's DOM.** Render into the `container` you receive from `registerTab`; the rest of the overlay is not yours.
- **Don't loop on the renderer thread.** Long synchronous work freezes the overlay. Use `requestIdleCallback`, web workers, or main-process IPC if you have heavy CPU work (we don't currently expose an IPC channel for plugins; raise an issue if you need one).
- **Don't ship secrets in `plugin.js`.** The file is downloaded to the user's disk and runnable by anyone.

## Getting help

- Read the reference plugin: [`examples/scalpel-plugins/hello-world`](examples/scalpel-plugins/hello-world)
- Open an issue on [scalpelpoe/scalpel](https://github.com/scalpelpoe/scalpel/issues) for SDK bugs or feature requests
- Open an issue on `filterscalpel/scalpel-plugins-registry` if your store listing has a problem

## License

The SDK and reference plugin are MIT-licensed. Your plugin's license is your own.
