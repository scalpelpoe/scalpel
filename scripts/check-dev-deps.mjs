#!/usr/bin/env node
// Friendly predev check. Without installed dependencies the dev chain fails
// later with e.g. "paraglide-js: command not found", which tells a new
// contributor nothing. This runs before `npm run dev` and explains the fix.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const checks = [
  ['node_modules/.bin/paraglide-js', 'paraglide-js'],
  ['node_modules/electron-vite/bin/electron-vite.js', 'electron-vite'],
  ['node_modules/electron', 'electron'],
]

const missing = checks.filter(([path]) => !existsSync(join(root, path))).map(([, name]) => name)
if (missing.length) {
  console.error(
    `Missing development dependencies (${missing.join(', ')}).\n` +
      'Run `npm ci` (or `npm install`) from the repository root first.',
  )
  process.exit(1)
}
