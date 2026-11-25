import { readdirSync, readFileSync } from 'node:fs'
import { join, posix, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Layer boundaries that the alias checker cannot express as import rewrites.
 *
 * - `common/` is OS-neutral: no imports of `linux/` or `ms-windows/`.
 * - `linux/common/` is below every desktop adapter: no imports of
 *   `linux/desktops/`.
 * - a desktop adapter never imports another desktop adapter.
 * - top-level modules (platform/router/boot) reach desktops only through the
 *   registry (`linux/desktops` or `desktop-policy`), never a compositor dir.
 */
const SRC = resolve(process.cwd(), 'packages/platform/src')

const SPEC_RE = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\1/g

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(SRC, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) walk(rel, out)
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(rel)
    }
  }
  return out
}

function targetOf(fileRel: string, spec: string): string | null {
  if (spec.startsWith('@platform/')) return spec.slice('@platform/'.length)
  if (spec.startsWith('.')) return posix.normalize(posix.join(posix.dirname(fileRel), spec))
  return null
}

function desktopOf(rel: string): string | null {
  const prefix = 'linux/desktops/'
  if (!rel.startsWith(prefix)) return null
  const rest = rel.slice(prefix.length)
  return rest.includes('/') ? rest.split('/')[0] : null
}

function importsOf(fileRel: string): string[] {
  const text = readFileSync(join(SRC, fileRel), 'utf8')
  return [...text.matchAll(SPEC_RE)].map((match) => match[2])
}

describe('platform layering', () => {
  const files = walk('')
  const edges = files.flatMap((fileRel) =>
    importsOf(fileRel)
      .map((spec) => ({ fileRel, spec, target: targetOf(fileRel, spec) }))
      .filter((edge): edge is { fileRel: string; spec: string; target: string } => edge.target !== null),
  )

  it('keeps common/ OS-neutral', () => {
    const violations = edges
      .filter(
        ({ fileRel, target }) =>
          fileRel.startsWith('common/') && (target.startsWith('linux/') || target.startsWith('ms-windows/')),
      )
      .map(({ fileRel, spec }) => `${fileRel}: ${spec}`)
    expect(violations).toEqual([])
  })

  it('keeps linux/common below every desktop adapter', () => {
    const violations = edges
      .filter(({ fileRel, target }) => fileRel.startsWith('linux/common/') && target.startsWith('linux/desktops/'))
      .map(({ fileRel, spec }) => `${fileRel}: ${spec}`)
    expect(violations).toEqual([])
  })

  it('never lets one desktop adapter import another', () => {
    const violations = edges
      .filter(({ fileRel, target }) => {
        const from = desktopOf(fileRel)
        const to = desktopOf(target)
        return !!from && !!to && from !== to
      })
      .map(({ fileRel, spec }) => `${fileRel}: ${spec}`)
    expect(violations).toEqual([])
  })

  it('lets top-level modules reach desktops only through the registry', () => {
    const allowed = new Set(['linux/desktops', 'linux/desktops/index', 'linux/desktops/backend-policy'])
    const violations = edges
      .filter(
        ({ fileRel, target }) => !fileRel.includes('/') && target.startsWith('linux/desktops/') && !allowed.has(target),
      )
      .map(({ fileRel, spec }) => `${fileRel}: ${spec}`)
    expect(violations).toEqual([])
  })
})
