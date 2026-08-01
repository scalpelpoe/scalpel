import { afterEach, describe, expect, it, vi } from 'vitest'

const MOCK_USER_DATA = vi.hoisted(() =>
  require('node:path').join(require('node:os').tmpdir(), `scalpel-sanitize-${Date.now()}`),
)
vi.mock('electron', () => ({ app: { getPath: vi.fn(() => MOCK_USER_DATA) } }))

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listVersions } from '../update/versions'
import { parseFilterFile } from './parser'
import { detectFilterDamage, repairFilterOnLoad, sanitizeFilter } from './sanitize'

describe('detectFilterDamage', () => {
  it('flags a block with an empty-value condition', () => {
    const content = ['Show', '\tBaseType ==', '\tSetFontSize 40'].join('\n')
    expect(detectFilterDamage(parseFilterFile('t', content), content)).toBe(true)
  })
  it('flags mixed CRLF and bare LF', () => {
    const content = 'Show\r\n\tSetFontSize 40\n'
    expect(detectFilterDamage(parseFilterFile('t', content), content)).toBe(true)
  })
  it('passes a clean uniform-LF filter', () => {
    const content = ['Show', '\tBaseType == "Chaos Orb"', '\tSetFontSize 40', ''].join('\n')
    expect(detectFilterDamage(parseFilterFile('t', content), content)).toBe(false)
  })
  it('passes a clean uniform-CRLF filter', () => {
    const content = ['Show', '\tBaseType == "Chaos Orb"', '\tSetFontSize 40', ''].join('\r\n')
    expect(detectFilterDamage(parseFilterFile('t', content), content)).toBe(false)
  })
  it('does NOT flag a value-less boolean condition (bare Corrupted)', () => {
    const content = ['Show', '\tCorrupted', '\tSetFontSize 40', ''].join('\n')
    expect(detectFilterDamage(parseFilterFile('t', content), content)).toBe(false)
  })
})

describe('sanitizeFilter', () => {
  it('strips a dangling empty condition but keeps a block that has other conditions', () => {
    const content = ['Show # $type->c $tier->t1', '\tRarity Normal', '\tBaseType ==', '\tSetFontSize 40', ''].join('\n')
    const r = sanitizeFilter(content)
    expect(r.changed).toBe(true)
    expect(r.emptyConditionsRemoved).toBe(1)
    expect(r.content).not.toMatch(/BaseType ==/)
    const reparsed = parseFilterFile('t', r.content)
    expect(reparsed.blocks).toHaveLength(1)
    expect(reparsed.blocks[0].conditions.every((c) => c.values.length > 0)).toBe(true)
    expect(reparsed.blocks[0].conditions.some((c) => c.type === 'Rarity')).toBe(true)
  })

  it('removes a block whose only condition was the dangling one (no catch-all)', () => {
    const content = ['Show', '\tBaseType ==', '\tSetFontSize 40', ''].join('\n')
    const r = sanitizeFilter(content)
    expect(r.changed).toBe(true)
    // The block is dropped entirely rather than left as a condition-less catch-all.
    expect(parseFilterFile('t', r.content).blocks).toHaveLength(0)
  })

  it('does not strip a value-less boolean condition', () => {
    const content = ['Show', '\tCorrupted', '\tBaseType == "Chaos Orb"', '\tSetFontSize 40', ''].join('\n')
    const r = sanitizeFilter(content)
    expect(r.changed).toBe(false)
    expect(r.content).toContain('Corrupted')
  })

  it('normalizes mixed CRLF/LF', () => {
    const content = 'Show\r\n\tSetFontSize 40\n\tSetTextColor 1 2 3 4\r\n'
    const r = sanitizeFilter(content)
    expect(r.eolNormalized).toBe(true)
    expect(r.changed).toBe(true)
    expect(/[^\r]\n/.test(r.content)).toBe(false)
  })

  it('returns a clean filter unchanged', () => {
    const content = ['Show', '\tBaseType == "Chaos Orb"', '\tSetFontSize 40', ''].join('\n')
    const r = sanitizeFilter(content)
    expect(r.changed).toBe(false)
    expect(r.content).toBe(content)
  })

  it('is idempotent', () => {
    const content = ['Show', '\tBaseType ==', '\tSetFontSize 40', ''].join('\n')
    const first = sanitizeFilter(content)
    expect(sanitizeFilter(first.content).changed).toBe(false)
  })
})

describe('repairFilterOnLoad', () => {
  // Unique filter basename per test so version checkpoints (keyed by basename in
  // the shared mock userData dir) never cross-contaminate listVersions counts.
  function tmpFilter(name: string, content: string): string {
    const p = join(mkdtempSync(join(tmpdir(), 'sani-')), `${name}.filter`)
    writeFileSync(p, content, 'utf-8')
    return p
  }

  const PRIOR = process.env.SCALPEL_E2E
  afterEach(() => {
    if (PRIOR === undefined) delete process.env.SCALPEL_E2E
    else process.env.SCALPEL_E2E = PRIOR
  })

  it('repairs a damaged file, rewrites it, and saves a checkpoint', () => {
    delete process.env.SCALPEL_E2E
    const content = ['Show # $type->c $tier->t1', '\tBaseType ==', '\tSetFontSize 40', ''].join('\n')
    const p = tmpFilter('repair-dmg', content)
    const out = repairFilterOnLoad(p, content)
    expect(out).not.toMatch(/BaseType ==/)
    expect(readFileSync(p, 'utf-8')).toBe(out)
    expect(listVersions(p).some((v) => v.isCheckpoint)).toBe(true)
  })

  it('leaves a clean file untouched and saves no checkpoint', () => {
    delete process.env.SCALPEL_E2E
    const content = ['Show', '\tBaseType == "Chaos Orb"', '\tSetFontSize 40', ''].join('\n')
    const p = tmpFilter('repair-clean', content)
    const out = repairFilterOnLoad(p, content)
    expect(out).toBe(content)
    expect(readFileSync(p, 'utf-8')).toBe(content)
    expect(listVersions(p)).toHaveLength(0)
  })

  it('is a no-op on a second call (already repaired)', () => {
    delete process.env.SCALPEL_E2E
    const content = ['Show # x', '\tBaseType ==', '\tSetFontSize 40', ''].join('\n')
    const p = tmpFilter('repair-twice', content)
    const fixed = repairFilterOnLoad(p, content)
    const again = repairFilterOnLoad(p, fixed)
    expect(again).toBe(fixed)
    expect(listVersions(p)).toHaveLength(1)
  })

  it('returns content untouched under SCALPEL_E2E', () => {
    process.env.SCALPEL_E2E = '1'
    const content = ['Show', '\tBaseType ==', ''].join('\n')
    const p = tmpFilter('repair-e2e', content)
    expect(repairFilterOnLoad(p, content)).toBe(content)
    expect(listVersions(p)).toHaveLength(0)
  })
})
