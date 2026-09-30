// Scalpel's Tailwind theme for the viewer bundles. Scans only the viewer and the Scalpel
// components it imports, so the Twitch bundle carries just the utilities it uses.
const scalpel = require('../../tailwind.config.js')

module.exports = {
  ...scalpel,
  content: {
    relative: true,
    files: [
      './src/**/*.{ts,tsx}',
      '../../src/renderer/src/components/primitives/{Button,Label,TextInput}.tsx',
      '../../src/renderer/src/components/ErrorBanner.tsx',
      '../../src/renderer/src/shared/IconGlow.tsx',
    ],
  },
}
