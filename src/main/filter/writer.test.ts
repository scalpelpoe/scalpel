import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FilterBlock } from '@shared/types'
import { parseFilterFile } from './parser'
import {
  detectIndent,
  moveBaseTypeBetweenTiers,
  renderFilterSelective,
  serializeBlock,
  writeBlockEdit,
  writeFilterSelective,
  writeFullFilter,
} from './writer'

function block(over: Partial<FilterBlock>): FilterBlock {
  return {
    id: 'x',
    visibility: 'Show',
    conditions: [],
    actions: [],
    continue: false,
    lineStart: 1,
    lineEnd: 1,
    ...over,
  }
}

describe('serializeBlock', () => {
  it('keeps a bare numeric condition bare (no injected operator)', () => {
    const b = block({
      conditions: [{ type: 'LinkedSockets', operator: '=', values: ['6'], explicitOperator: false }],
    })
    expect(serializeBlock(b, '\t')).toContain('\tLinkedSockets 6')
  })

  it('preserves an explicitly authored operator', () => {
    const b = block({
      conditions: [{ type: 'ItemLevel', operator: '>=', values: ['75'], explicitOperator: true }],
    })
    expect(serializeBlock(b, '\t')).toContain('\tItemLevel >= 75')
  })

  it('uses the provided indent string', () => {
    const b = block({ conditions: [{ type: 'Quality', operator: '>', values: ['0'], explicitOperator: true }] })
    expect(serializeBlock(b, '    ')).toContain('    Quality > 0')
  })

  it('emits a multi-line leading comment as separate lines', () => {
    const b = block({ leadingComment: '# a\n# b' })
    const out = serializeBlock(b, '\t')
    expect(out[0]).toBe('# a')
    expect(out[1]).toBe('# b')
    expect(out.some((l) => l.includes('\n'))).toBe(false)
  })

  it('detectIndent returns a tab for tab-indented files', () => {
    expect(detectIndent(['Show', '\tItemLevel >= 5'])).toBe('\t')
  })
})

const FIXTURE = [
  '#===== SECTION =====',
  '# [[0100]] Currency',
  'Show # $type->currency $tier->t1',
  '\tBaseType == "Divine Orb" "Mirror of Kalandra"',
  '\tLinkedSockets 6',
  '\tSetFontSize 45',
  '',
  '# a standalone note',
  'Show # $type->currency $tier->t2',
  '\tBaseType == "Chaos Orb"',
  '\tSetFontSize 40',
  '',
].join('\n')

describe('renderFilterSelective', () => {
  it('preserves blank lines and section comments around an edited block', () => {
    const file = parseFilterFile('t.filter', FIXTURE)
    file.blocks[0].visibility = 'Hide'
    const { content } = renderFilterSelective(file, new Set([0]))
    expect(content).toContain('#===== SECTION =====')
    expect(content).toContain('# [[0100]] Currency')
    expect(content).toContain('# a standalone note')
    expect(content).toMatch(/SetFontSize 45\n\n# a standalone note/)
  })

  it('keeps a bare LinkedSockets bare when re-serializing', () => {
    const file = parseFilterFile('t.filter', FIXTURE)
    file.blocks[0].visibility = 'Hide'
    const { content } = renderFilterSelective(file, new Set([0]))
    expect(content).toContain('LinkedSockets 6')
    expect(content).not.toContain('LinkedSockets = 6')
  })

  it('preserves CRLF line endings with no bare LF', () => {
    const file = parseFilterFile('t.filter', FIXTURE.replace(/\n/g, '\r\n'))
    file.blocks[0].visibility = 'Hide'
    const { content } = renderFilterSelective(file, new Set([0]))
    expect(content.includes('\r\n')).toBe(true)
    expect(/[^\r]\n/.test(content)).toBe(false)
  })

  it('falls back to raw lines and reports the block when serialization would be invalid', () => {
    const file = parseFilterFile('t.filter', FIXTURE)
    file.blocks[1].conditions = file.blocks[1].conditions.map((c) => (c.type === 'BaseType' ? { ...c, values: [] } : c))
    const { content, fallbackBlocks } = renderFilterSelective(file, new Set([1]))
    expect(fallbackBlocks).toEqual([1])
    expect(content).toContain('"Chaos Orb"')
    expect(content).not.toMatch(/BaseType ==\s*$/m)
  })

  it('writeFilterSelective returns the fallback summary', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wtest-'))
    const p = join(dir, 'o.filter')
    const file = parseFilterFile(p, FIXTURE)
    file.blocks[0].visibility = 'Hide'
    const res = writeFilterSelective(file, new Set([0]))
    expect(res.fallbackBlocks).toEqual([])
    expect(readFileSync(p, 'utf-8')).toContain('Hide # $type->currency $tier->t1')
  })
})

describe('UI writers preserve line endings', () => {
  const CRLF = FIXTURE.replace(/\n/g, '\r\n')

  it('writeBlockEdit keeps CRLF and does not eat the trailing blank/comment', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wedit-'))
    const p = join(dir, 'o.filter')
    const file = parseFilterFile(p, CRLF)
    const updated = { ...file.blocks[0], visibility: 'Hide' as const }
    writeBlockEdit(file, 0, updated)
    const out = readFileSync(p, 'utf-8')
    expect(/[^\r]\n/.test(out)).toBe(false) // no bare LF
    expect(out).toContain('# a standalone note') // block-1 leading note survives
    expect(parseFilterFile(p, out).blocks).toHaveLength(2)
  })

  it('moveBaseTypeBetweenTiers keeps CRLF', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wmove-'))
    const p = join(dir, 'o.filter')
    const file = parseFilterFile(p, CRLF)
    moveBaseTypeBetweenTiers(file, 'Divine Orb', 0, 1)
    const out = readFileSync(p, 'utf-8')
    expect(/[^\r]\n/.test(out)).toBe(false)
  })

  it('writeFullFilter round-trips an unedited CRLF filter byte-for-byte', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wfull-'))
    const p = join(dir, 'o.filter')
    const file = parseFilterFile(p, CRLF)
    writeFullFilter(file)
    expect(readFileSync(p, 'utf-8')).toBe(CRLF)
  })
})

describe('renderFilterSelective removedBlocks', () => {
  it('drops a block entirely when listed in removedBlocks', () => {
    const content = [
      'Show # a',
      '\tBaseType == "X"',
      '\tSetFontSize 40',
      '',
      'Show # b',
      '\tBaseType == "Y"',
      '\tSetFontSize 41',
      '',
    ].join('\n')
    const file = parseFilterFile('t.filter', content)
    const { content: out } = renderFilterSelective(file, new Set(), new Set([0]))
    expect(out).not.toContain('"X"')
    expect(out).toContain('"Y"')
    expect(parseFilterFile('t', out).blocks).toHaveLength(1)
  })

  it("serializeBlock quotes a value containing '#' so it round-trips", () => {
    const b = block({
      conditions: [{ type: 'BaseType', operator: '==', values: ['Weird#Name'], explicitOperator: true }],
    })
    const line = serializeBlock(b, '\t').find((l) => l.includes('BaseType'))
    expect(line).toContain('"Weird#Name"')
  })
})
