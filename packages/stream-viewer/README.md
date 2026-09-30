# @scalpel/stream-viewer

What viewers see of Scalpel Stream: a PoE2 streamer's equipped gear, skills, jewels and keystones, published by Scalpel through `scalpel-stream-api`.

It builds two targets from one set of components:
- **Twitch extension** (`dist/extension/`), with four pages:
  - `video_overlay.html`: a GEAR tab on the player's right edge that opens the panel;
  - `mobile.html`;
  - `panel.html`: a compact list under the player, also shown while offline;
  - `config.html`: the broadcaster pastes the pairing code from Scalpel here.
- **Public site** (`dist/web/`) for `live.scalpel.fourth.party`:
  - `/<channel>`: the gear page;
  - `/<channel>/obs?layout=compact|full`: a transparent OBS browser source.

## Develop

- **Storybook:** `npm run storybook` at the repo root. The stories live in `src/stories`. `RealCharacter` runs a real poe.ninja capture through Scalpel's normalizer and tier badges.
- **Tests:** they run with the root suite (`npm test`), or on their own with `npx vitest run packages/stream-viewer`.
- **Typecheck:** covered by the root `npm run typecheck`.
- **Local API:** set `VITE_STREAM_API=http://127.0.0.1:8787` to point at `wrangler dev` of scalpel-stream-api.

## Build

```
npm run build:extension --prefix packages/stream-viewer
npm run build:web --prefix packages/stream-viewer
```

The extension build is unminified with relative paths, because Twitch review wants readable JS and serves the zip from a CDN path. Each page loads the Twitch helper as its first script.

## Release

- **Twitch:**
  1. Zip the contents of `dist/extension/` (not the folder itself).
  2. Upload it as a new version in the Twitch developer console.
  3. Set the view paths: overlay `video_overlay.html`, mobile `mobile.html`, panel `panel.html` (height 500), config `config.html`.
  4. Allowlist fetch `https://api.scalpel.fourth.party` and images `https://web.poecdn.com`.
- **Public site:** `npx wrangler deploy` from this folder deploys `dist/web` as the `scalpel-stream-live` Worker (static assets with SPA fallback). Then add the `live.scalpel.fourth.party` custom domain.
