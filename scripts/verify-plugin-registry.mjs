// Checks every plugin in the live curated registry against this Scalpel build's plugin host:
// downloads the registry plus each plugin's released manifest.json and plugin.js, verifies the
// published sha256 pins, and compares the registry, install, and load gates with Scalpel 1.0.5.
// Downloaded plugin code is hashed, never executed.
//
//   npm run verify:plugin-registry              check the live registry
//   npm run verify:plugin-registry -- --update  also refresh src/main/plugins/__fixtures__/registry-snapshot.json
//
// The offline half of the same suite runs in `npm test` against the committed snapshot.
import { spawnSync } from 'node:child_process'

const update = process.argv.includes('--update')
const result = spawnSync('npx', ['vitest', 'run', 'src/main/plugins/registry-compat.test.ts'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    SCALPEL_LIVE_REGISTRY: '1',
    ...(update ? { SCALPEL_UPDATE_REGISTRY_SNAPSHOT: '1' } : {}),
  },
})
process.exit(result.status ?? 1)
