#!/usr/bin/env node
// Enforces Scalpel's import-path convention across src/.
//
// Aliases (see tsconfig paths + electron.vite/vitest resolve.alias):
//   @shared -> src/shared, @main -> src/main, @renderer -> src/renderer/src
//
// Rules:
//   1. Dependency direction (hard error, not auto-fixable):
//        - shared must not import main or renderer (shared is the common base).
//        - renderer must not import main, and main must not import renderer
//          (the two run in different processes; share via @shared / preload).
//      This holds for relative paths AND alias paths (a renderer file writing
//      `@main/...` is just as wrong as `../../main/...`).
//   2. Reaching into another area must use that area's alias, never a relative
//      path. In practice this is "import into shared uses @shared" (auto-fixable).
//   3. Within one area, a relative import that climbs MAX_RELATIVE_DEPTH+ levels
//      (`../../../`) must use the area alias instead (auto-fixable).
//
// Usage: node scripts/check-import-aliases.mjs [--fix]
//   default  - report violations, exit 1 if any.
//   --fix    - rewrite the auto-fixable ones in place; exit 1 only if hard
//              dependency-direction errors remain.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Ordered most-specific-first so src/renderer/src/shared/* resolves to renderer,
// not the top-level shared area.
const AREA_ROOTS = [
  ['renderer', 'src/renderer/src'],
  ['shared', 'src/shared'],
  ['main', 'src/main'],
]
const ALIAS = { shared: '@shared', main: '@main', renderer: '@renderer' }
const ALIAS_AREA = { '@shared': 'shared', '@main': 'main', '@renderer': 'renderer' }

// Forbidden dependency directions: `${from}->${to}`.
const FORBIDDEN = new Set(['renderer->main', 'main->renderer', 'shared->main', 'shared->renderer'])

// A relative import climbing more than this many levels must use the alias.
// 2 keeps `./x`, `../x`, `../../x`; flags `../../../x` and deeper.
const MAX_RELATIVE_DEPTH = 2

// Skipped trees: generated (paraglide), vendored regex data, and the plugin-sdk
// - a separately-published package with its own build that does not know the
// monorepo aliases, so its imports must stay relative.
const SKIP_DIRS = new Set(['paraglide', 'node_modules', 'plugin-sdk', 'vendor'])

/** Area that an `src/...`-relative posix path belongs to, or 'other'. */
export function areaOf(relPath) {
  for (const [area, root] of AREA_ROOTS) {
    if (relPath === root || relPath.startsWith(`${root}/`)) return area
  }
  return 'other'
}

/** `@renderer/components/Foo` for a target inside the renderer area, etc. */
function aliasFor(area, targetRel) {
  const root = AREA_ROOTS.find(([a]) => a === area)[1]
  const rest = targetRel === root ? '' : targetRel.slice(root.length + 1)
  return rest ? `${ALIAS[area]}/${rest}` : ALIAS[area]
}

/** Leading `../` count of a relative specifier. */
function upwardDepth(spec) {
  return (spec.match(/\.\.\//g) || []).length
}

/**
 * Classify one import specifier seen in `fromRel` (an src/...-relative posix
 * path). Returns { kind: 'ok' | 'fix' | 'error', replacement?, reason? }.
 */
export function classify(fromRel, spec) {
  const fromArea = areaOf(fromRel)

  // Alias specifier: only the dependency direction can be wrong.
  const aliasPrefix = spec.split('/')[0]
  if (ALIAS_AREA[aliasPrefix]) {
    const toArea = ALIAS_AREA[aliasPrefix]
    if (FORBIDDEN.has(`${fromArea}->${toArea}`)) {
      return { kind: 'error', reason: `${fromArea} must not import ${toArea} (${spec})` }
    }
    return { kind: 'ok' }
  }

  // Only relative specifiers are otherwise in scope.
  if (!spec.startsWith('.')) return { kind: 'ok' }

  const targetRel = posix.normalize(posix.join(posix.dirname(fromRel), spec))
  const toArea = areaOf(targetRel)

  // Targets outside the three aliased areas (preload, plugin-sdk, resources)
  // have no alias; leave them relative.
  if (toArea === 'other') return { kind: 'ok' }

  if (FORBIDDEN.has(`${fromArea}->${toArea}`)) {
    return { kind: 'error', reason: `${fromArea} must not import ${toArea} (${spec})` }
  }

  // Reaching into another area -> must use that area's alias.
  if (toArea !== fromArea) {
    return { kind: 'fix', replacement: aliasFor(toArea, targetRel) }
  }

  // Same area: only deep climbs must alias.
  if (upwardDepth(spec) > MAX_RELATIVE_DEPTH) {
    return { kind: 'fix', replacement: aliasFor(toArea, targetRel) }
  }

  return { kind: 'ok' }
}

// Matches the module specifier of: `from '...'`, `import('...')`,
// `require('...')`, and side-effect `import '...'`.
const SPEC_RE = /(\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"])([^'"]+)\2/g

/**
 * Process one file's text. Returns { text, violations } where `text` already
 * has auto-fixes applied when `fix` is true.
 */
export function processSource(fromRel, src, fix) {
  const violations = []
  const text = src.replace(SPEC_RE, (match, lead, quote, spec, offset) => {
    const verdict = classify(fromRel, spec)
    if (verdict.kind === 'ok') return match
    const line = src.slice(0, offset).split('\n').length
    violations.push({ line, spec, ...verdict })
    if (fix && verdict.kind === 'fix') return `${lead}${quote}${verdict.replacement}${quote}`
    return match
  })
  return { text, violations }
}

function walk(dirRel, out) {
  for (const entry of readdirSync(resolve(REPO_ROOT, dirRel), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(`${dirRel}/${entry.name}`, out)
    } else if (/\.(ts|tsx|mts|js|jsx|cjs)$/.test(entry.name)) {
      out.push(`${dirRel}/${entry.name}`)
    }
  }
  return out
}

function main() {
  const fix = process.argv.includes('--fix')
  const files = walk('src', [])
  let fixed = 0
  const errors = []

  for (const rel of files) {
    const abs = resolve(REPO_ROOT, rel)
    const src = readFileSync(abs, 'utf8')
    const { text, violations } = processSource(rel, src, fix)
    if (!violations.length) continue

    if (fix && text !== src) {
      writeFileSync(abs, text)
      fixed += violations.filter((v) => v.kind === 'fix').length
    }
    for (const v of violations) {
      // In --fix mode the auto-fixed ones are resolved; only surface errors.
      if (fix && v.kind === 'fix') continue
      errors.push(`${rel}:${v.line}  ${v.kind === 'error' ? 'forbidden' : 'needs alias'}: ${v.reason ?? v.spec} -> ${v.replacement ?? ''}`.trimEnd())
    }
  }

  if (fix && fixed) console.log(`check-import-aliases: rewrote ${fixed} import(s) to aliases`)

  if (errors.length) {
    console.error(`check-import-aliases: ${errors.length} violation(s)\n${errors.join('\n')}`)
    process.exit(1)
  }
  console.log(`check-import-aliases: ${files.length} files clean`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
