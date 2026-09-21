// Exercise the release artifact, not a sibling directory or a workspace link.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const artifact = resolve(root, manifest.dependencies['@scalpel/item-data'].replace(/^file:/, ''))
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
assert.equal(lock.packages['node_modules/@scalpel/item-data'].integrity,
  'sha512-' + createHash('sha512').update(readFileSync(artifact)).digest('base64'), 'Lockfile integrity must pin the release bytes')
const temp = mkdtempSync(join(tmpdir(), 'scalpel-item-data-'))
const npm = process.env.npm_execpath
assert.ok(npm, 'Run through npm run verify:item-data')

function run(args, cwd = temp) {
  const result = spawnSync(process.execPath, [npm, ...args], { cwd, encoding: 'utf8', timeout: 120000 })
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout)
  return result.stdout
}

try {
  // Repacking reviewed source must reproduce the committed artifact exactly.
  run(['pack', join(root, 'packages/item-data'), '--pack-destination', temp])
  const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
  assert.equal(digest(join(temp, basename(artifact))), digest(artifact), 'Repack differs from committed artifact')
  writeFileSync(join(temp, 'package.json'), JSON.stringify({ name: 'item-data-consumer-smoke', version: '1.0.0', private: true }))
  run(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', artifact])
  const installed = join(temp, 'node_modules/@scalpel/item-data')
  const load = spawnSync(process.execPath, ['-e', "for (const game of [1, 2]) require('@scalpel/item-data/poe' + game + '.json')"], { cwd: temp, encoding: 'utf8' })
  assert.equal(load.status, 0, load.stderr)
  const integrity = JSON.parse(readFileSync(join(installed, 'integrity.json'), 'utf8'))
  for (const game of [1, 2]) {
    const filename = `poe${game}.json`
    assert.equal(digest(join(installed, filename)), integrity[filename].sha256)
    assert.equal(digest(join(installed, filename)), digest(join(root, 'packages/item-data', filename)))
  }
  const entry = join(temp, 'entry.js')
  writeFileSync(entry, `export const load = game => game === 1 ? import('@scalpel/item-data/poe1.json') : import('@scalpel/item-data/poe2.json');`)
  const result = await build({ entryPoints: [entry], bundle: true, splitting: true, format: 'esm', outdir: join(temp, 'out'), metafile: true, write: false })
  for (const game of [1, 2]) {
    const chunk = Object.values(result.metafile.outputs).find((output) => output.entryPoint?.endsWith(`/poe${game}.json`))
    assert.ok(chunk, `Game ${game} must have its own lazy chunk`)
    assert.ok(!Object.keys(chunk.inputs).some((file) => file.endsWith(`/poe${3 - game}.json`)))
  }
  console.log(`Verified reproducible artifact, clean installation, exact data and separate lazy chunks: ${digest(artifact)}`)
} finally {
  // Remove only this invocation's owned temporary consumer.
  assert.ok(resolve(temp).startsWith(resolve(tmpdir()) + sep))
  rmSync(temp, { recursive: true, force: true })
}
