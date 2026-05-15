# Writing Scalpel plugins

Scalpel supports third-party plugins that show up as new tabs in the overlay. A plugin is a single bundled JavaScript file you author against a typed SDK, distributed via your own GitHub repository, and discovered through a curated registry. This document is for plugin authors.

A complete reference plugin that exercises every SDK component lives at [`scalpelpoe/scalpel-plugin-examples`](https://github.com/scalpelpoe/scalpel-plugin-examples). Read it alongside this doc.

## What you can build

A plugin can:

- Render arbitrary UI in its own tab (React, vanilla DOM, anything that runs in a browser)
- React to the player's most recent hotkey'd item, current zone, and league
- Register a hotkey that the user binds in Scalpel's existing Macros settings
- Persist its own settings to disk
- Call out to the internet (poe.ninja, your own backend, etc.)
- Use Scalpel's helpers for item identity, URL building, formatting, and rendering

A plugin can NOT:

- Read Scalpel's loaded filter, audit data, or settings beyond its own storage
- Modify or read other plugins' state
- Affect the built-in tabs

## Quickstart

The fastest path is to start from the reference plugin:

```bash
git clone https://github.com/scalpelpoe/scalpel-plugin-examples.git
cd scalpel-plugin-examples

npm install
npm run build
```

Then either iterate in that clone or copy its files into your own repo as a starting point.

Then load it into Scalpel for testing (see [Local testing](#local-testing) below).

## Plugin entry point

Your `src/index.tsx` exports a default function Scalpel calls once on startup:

```tsx
import type { ScalpelPluginContext } from '@scalpelpoe/plugin-sdk'

export default function activate(ctx: ScalpelPluginContext): void {
  ctx.registerTab({
    label: 'My plugin',
    icon: renderToStaticMarkup(<PassportOne theme="two-tone" />),
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

  // Tab registration (call exactly once).
  // `icon` is inline SVG markup (or a data URL). Scalpel clamps the rendered
  // size to 16x16 and forces `display: flex` on any descendant SVG, so the
  // plugin doesn't manage sizing. See the Tab icons section below for the
  // recommended way to author icons with iconpark.
  registerTab(opts: {
    label: string
    icon: string
    render: (container: HTMLElement) => (() => void) | void
  }): void

  // Hotkey registration (call at most once)
  // Surfaces in Settings > Macros > Plugin Hotkeys; the user binds the key.
  registerHotkey(opts: { label: string }, handler: () => void): void

  // Workflow helpers
  // Run the same copy flow as Scalpel's main hotkey: sends Ctrl+C to PoE,
  // reads the clipboard, parses the item, and fires onCurrentItem for all
  // plugins and Scalpel's own filter/price-check views. Returns the parsed
  // item, or null if the clipboard didn't contain a recognisable PoE item.
  copyAndEvaluateItem(): Promise<PoeItem | null>
  // Switch the overlay to this plugin's tab. No-op before registerTab is called.
  openTab(): void

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

### Tab icons

`icon` is always an SVG string, but you don't have to hand-write one. Scalpel clamps the rendered icon to 16x16 and forces `display: flex` on any descendant SVG, so you never need to set `width`, `height`, `viewBox`, or `display`. Two authoring paths:

**1. iconpark via `renderToStaticMarkup` (recommended)** - matches Scalpel's house style exactly because Scalpel uses iconpark itself. Render the icon to a string at activation time:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { PassportOne } from '@icon-park/react'

ctx.registerTab({
  label: 'My plugin',
  icon: renderToStaticMarkup(
    <PassportOne theme="two-tone" fill={['currentColor', 'rgba(255,255,255,0.2)']} />,
  ),
  render: (container) => { /* ... */ },
})
```

`theme="two-tone"` plus `fill={['currentColor', 'rgba(255,255,255,0.2)']}` gives the same look as the built-in `Buy` / `Setting` icons. The same pattern works with any React icon library (lucide, heroicons, your own SVG components) - render to a string once, pass it in.

The reason for `renderToStaticMarkup` rather than passing a `ReactNode` directly: plugins and the host run different React instances, so a plugin component rendered inside the host's tree crashes on `useContext`. Rendering to a string keeps the component bound to the plugin's own React.

**2. Raw inline SVG markup** - drop in any SVG string. Useful when you don't want an icon-library dependency:

```tsx
const ICON = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4"><path d="..."/></svg>'
ctx.registerTab({ icon: ICON, /* ... */ })
```

The host clamps both paths identically (`[&_svg]:w-4 [&_svg]:h-4 [&_svg]:block`). Stroke weight is the only thing you tune for visual density - `stroke-width="4"` at `viewBox="0 0 48 48"` is the iconpark default and reads correctly at 16x16.

### Plugin as a workflow entry point

`copyAndEvaluateItem` and `openTab` let a plugin act as an alternate item-inspection entry point. Bind a hotkey, hover an item in PoE, press the hotkey - the plugin copies the item, updates Scalpel's filter and price-check views, and switches to its own tab:

```tsx
ctx.registerHotkey({ label: 'Inspect item' }, async () => {
  const item = await ctx.copyAndEvaluateItem()
  if (item) {
    ctx.openTab()
    // item is now available via ctx.getCurrentItem() and onCurrentItem subscribers
  }
})
```

Because `copyAndEvaluateItem` fires the same pipeline as Scalpel's main hotkey, all other tabs (Filter, Price Check) also reflect the copied item. The user does not need to press Scalpel's own hotkey separately.

## Forwarded helpers, hooks, and components

The SDK re-exports utilities Scalpel uses internally so you don't have to reimplement them. Import any of these from `@scalpelpoe/plugin-sdk`:

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

**Primitive form controls**

These map Scalpel's design tokens to standard HTML inputs. You can use them directly inside your plugin tab without writing any Tailwind.

```tsx
import { Button, TextInput, Textarea, Slider, Label } from '@scalpelpoe/plugin-sdk'

// Button - variant: 'primary' | 'secondary' | 'danger' | 'ghost', size: 'sm' | 'md'
<Button variant="primary" onClick={save}>Save</Button>
<Button variant="danger" size="sm" onClick={remove}>Delete</Button>
<Button variant="ghost" iconOnly size="sm"><TrashIcon /></Button>

// TextInput / Textarea
<Label htmlFor="name">Filter name</Label>
<TextInput id="name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />

<Textarea value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth rows={4} />

// Slider
<Slider min={0} max={100} value={val} onChange={(e) => setVal(Number(e.target.value))} fullWidth />
```

**Number scrubber**

- `<ScrubInput value onChange />` - compact scrub-to-change number input; `value` is `number | null`, `onChange` receives `number | null`. Optional: `min`, `max`, `step`, `decimals`, `placeholder`, `suffix`, `defaultValue`, `color`.

**Item chip**

- `<ItemChip name itemClass? onClick? title? />` - renders an item pill with the icon from Scalpel's icon cache. The icon resolves from the same live map Scalpel uses internally (populated once the renderer knows its PoE version). Pass `itemClass="Divination Cards"` to get the CDN card art instead of a base-type icon.

```tsx
import { ItemChip } from '@scalpelpoe/plugin-sdk'

<ItemChip name="Mirror of Kalandra" onClick={() => openDetails()} />
<ItemChip name="The Doctor" itemClass="Divination Cards" />
```

**Icon resolution helper**

- `getItemIcon(item)` - returns the icon URL for a `PoeItem`, or `null` if none is known. Uses the same lookup logic as Scalpel's item hero. Returns `null` before Scalpel's renderer has initialised (i.e. before `poeVersion` resolves).

**Form-row containers**

These render the standard Scalpel settings-row chrome (label on the left, control on the right):

- `<SettingToggleBox label checked onChange />` - Yes/No toggle row
- `<SettingSelectBox label value options onChange />` - native-select row with a Change button
- `<LeagueDropdown id label? value options onChange />` - league picker row; use `id` to target the hidden `<select>` for `showPicker()`

**Hotkey inputs**

- `<HotkeyField value onChange />` - full-width hotkey recorder with a Change button. Used for filter/price-check hotkey rows.
- `<HotkeyRecorder value onChange className? />` - compact 200px variant without the Change button. Used inside macro rows where space is tight.
- `keyEventToAccelerator(e)` - converts a `KeyboardEvent` to an Electron accelerator string (`"CommandOrControl+Shift+F"`), or `null` for bare modifier presses.
- `prettyHotkey(accelerator)` - formats an accelerator for display (`"CommandOrControl"` becomes `"Ctrl"` on Windows).

**Other forwarded components**

- `<RemoveButton onClick />` - small X button with hover-red styling
- `<ExternalLinkButton label title onClick />` - pill button for Wiki/PoEDB-style external links

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
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@scalpelpoe/plugin-sdk'],
    },
    minify: 'esbuild',
    sourcemap: true,
  },
})
```

Externalize React and the SDK - Scalpel injects them at runtime via a custom protocol. If you bundle your own React, hooks will silently fail because your `useState` and Scalpel's `createRoot` will point at different React instances.

### Installing the SDK

```bash
npm install --save-dev @scalpelpoe/plugin-sdk
```

The package is **types only**. At runtime, Scalpel serves the real implementations via its `scalpel-internal://sdk.js` custom protocol; the renderer's importmap reroutes `@scalpelpoe/plugin-sdk` to that URL. The npm package ships:

- `dist/index.d.ts` - bundled TypeScript declarations (`PoeItem`, `ScalpelPluginContext`, every component, every helper) plus the `Window.api` ambient that `HotkeyField` / `useCurrentZone` and friends need.
- `dist/index.js` - a runtime stub. Each export is a Proxy that throws with a helpful message if anything actually calls it. Inside Scalpel the importmap shadows this file; outside Scalpel (test runners, tools that don't honour your bundler's `external` config), the throw tells you to fix your config.

Because the runtime never ships from npm, **the SDK's npm version pins the Scalpel host range you target**. Bump the `scalpelMinVersion` in your `manifest.json` to whatever Scalpel version the API surface you're using first appeared in (you'll see additions called out in Scalpel release notes).

### Design tokens

Plugins running inside Scalpel inherit CSS variables (`--accent`, `--text`, `--bg`, etc.) from Scalpel's stylesheet automatically. Use them directly in inline styles or className utilities:

```tsx
<div style={{ color: 'var(--text)', background: 'var(--bg-card)' }}>...</div>
```

For dev environments outside Scalpel (Storybook, isolated component tests), import the static token file:

```css
@import '@scalpelpoe/plugin-sdk/tokens.css';
```

If you use Tailwind in your plugin's build pipeline, extend your config with Scalpel's preset to get utility classes mapped to the design tokens:

```js
// tailwind.config.js
const scalpelPreset = require('@scalpelpoe/plugin-sdk/tailwind-preset.cjs')
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
  "scalpelMinVersion": ">=0.9.8",
  "poeVersions": [1, 2],
  "tabIcon": "icon.svg"
}
```

Field notes:

- `id` must match `^[a-z][a-z0-9-]{2,49}$` and matches the directory name in `userData/plugins/<id>/`.
- `version` is your plugin's own version, separate from `manifestVersion` (the manifest schema version, currently 1).
- `scalpelMinVersion` is a comparator expression (`">=0.9.8"`, `">=0.9.8 <1.0"`). If the running Scalpel doesn't satisfy it, the plugin won't load.
- `poeVersions` gates which games the plugin appears under. Omit for both.
- `tabIcon` is optional; you can also pass an inline SVG string via `registerTab({ icon })`.

## Local testing

While developing, skip the registry and install your plugin directly.

**Option 1: "Load unpacked" button** (Scalpel >= 0.9.8)

1. In Scalpel, open Settings → Developer.
2. Toggle "Developer mode" on.
3. Click "Load unpacked plugin..." and pick the directory containing your built `plugin.js` and `manifest.json`.
4. Your tab appears in the title bar immediately.

**Option 2: Manual file copy**

1. Find your Scalpel `userData` folder:
   - Windows: `%APPDATA%\Scalpel`
   - macOS: `~/Library/Application Support/Scalpel`
   - Linux: `~/.config/Scalpel`
2. Create `userData/plugins/<your-id>/` and copy `dist/plugin.js` + `dist/manifest.json` into it.
3. Edit `userData/plugins/installed.json` to include your id: `["your-id"]`.
4. Restart Scalpel to load the manually placed plugin.

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

Once your plugin has a working release, open a pull request against [`scalpelpoe/scalpel-plugins-registry`](https://github.com/scalpelpoe/scalpel-plugins-registry) adding an entry to `registry.json`:

```json
{
  "id": "jewel-economy",
  "name": "Jewel Economy",
  "author": "your-github-username",
  "description": "Explore jewel pricing and lab-farming math.",
  "repo": "your-github-username/scalpel-plugin-jewel-economy",
  "latestVersion": "1.0.0",
  "sha256": "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532",
  "scalpelMinVersion": ">=0.9.8",
  "poeVersions": [1, 2],
  "iconUrl": "https://raw.githubusercontent.com/your-user/your-plugin/main/icon.png",
  "homepage": "https://github.com/your-user/your-plugin"
}
```

The `sha256` field is the lowercase hex SHA-256 of the exact `plugin.js` you attached to the release. Scalpel recomputes it on download and rejects the install if the bytes don't match, so a compromised or swapped release asset can't be silently loaded. Compute it from your built artifact:

```bash
node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('plugin.js')).digest('hex'))"
```

The value must be lowercase hex (64 chars). `sha256sum plugin.js` and `shasum -a 256 plugin.js` already produce lowercase; PowerShell's `Get-FileHash plugin.js -Algorithm SHA256` works but emits uppercase, so lowercase it (`.Hash.ToLower()`). An uppercase or otherwise malformed value makes the registry entry fail validation and the plugin silently won't appear in Browse.

After the PR merges, Scalpel users see your plugin in Settings → Plugins → Browse with a one-click Install button.

To publish an update: bump `version` in your `manifest.json`, cut a new tag, attach the artifacts to the new release, and update `latestVersion` and `sha256` in `registry.json` via another PR.

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

- Read the reference plugin: [`scalpelpoe/scalpel-plugin-examples`](https://github.com/scalpelpoe/scalpel-plugin-examples)
- Open an issue on [scalpelpoe/scalpel](https://github.com/scalpelpoe/scalpel/issues) for SDK bugs or feature requests
- Open an issue on `scalpelpoe/scalpel-plugins-registry` if your store listing has a problem

## License

The SDK and reference plugin are MIT-licensed. Your plugin's license is your own.
