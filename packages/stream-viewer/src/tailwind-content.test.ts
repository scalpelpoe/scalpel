import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const picomatch = require('picomatch') as (glob: string | string[]) => (path: string) => boolean

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(pkgDir, 'src')
const rendererDir = resolve(pkgDir, '../../src/renderer/src')
const config = require('../tailwind.config.cjs') as { content: { files: string[] } }

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

const resolveModule = (base: string): string | null => {
  for (const c of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(c)) return c
  }
  return null
}

const IMPORT_RE = /(?:from|import)\s*\(?\s*['"](@renderer\/[^'"]+)['"]/g

/** The `@renderer/...` modules the given file imports, resolved to files. */
const rendererImports = (file: string): string[] => {
  const out: string[] = []
  for (const m of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
    const resolved = resolveModule(join(rendererDir, m[1].slice('@renderer/'.length)))
    if (resolved) out.push(resolved)
  }
  return out
}

describe('tailwind content globs', () => {
  it('scan every Scalpel renderer module the viewer imports', () => {
    const sources = walk(srcDir).filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\./.test(f) && !f.includes(`${join('src', 'stories')}`))
    const modules = new Set<string>()
    for (const file of sources) {
      for (const dep of rendererImports(file)) {
        modules.add(dep)
        // Re-exports one level deep: `export ... from '@renderer/...'` inside the imported module.
        if (/export\s[^;]*from\s*['"]@renderer\//.test(readFileSync(dep, 'utf8'))) {
          for (const inner of rendererImports(dep)) modules.add(inner)
        }
      }
    }
    expect(modules.size).toBeGreaterThan(0)

    const matches = picomatch(config.content.files.map((g) => g.replace(/^\.\//, '')))
    const rel = (m: string): string => relative(pkgDir, m).split(sep).join('/')
    const missing = [...modules].filter((m) => m.endsWith('.tsx') && !matches(rel(m)))
    expect(missing.map(rel)).toEqual([])
  })
})
