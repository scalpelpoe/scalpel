import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  filterBladeUrl,
  isLinkedLocalFilterPath,
  listFilterBladeCandidates,
  poeFilterIdFromOnlinePath,
  poeItemFilterUrl,
  resolveFilterBladeLink,
  scoreFilterBladeCandidate,
} from './filterblade-bridge'
import { poeItemFilterLadderUrl } from '@shared/endpoints'

describe('scoreFilterBladeCandidate', () => {
  it('scores NeverSink / FilterBlade names highly', () => {
    expect(scoreFilterBladeCandidate("NeverSink's filter - Semi-Strict")).toBeGreaterThan(
      scoreFilterBladeCandidate('My Custom Filter'),
    )
    expect(scoreFilterBladeCandidate('Soft', '# NeverSink PoE2')).toBeGreaterThan(1)
  })
})

describe('listFilterBladeCandidates / resolveFilterBladeLink', () => {
  function seedOnline(names: Array<{ id: string; name: string; extra?: string }>): string {
    const root = mkdtempSync(join(tmpdir(), 'scalpel-fb-'))
    const online = join(root, 'OnlineFilters')
    mkdirSync(online, { recursive: true })
    for (const n of names) {
      writeFileSync(join(online, n.id), `#name:${n.name}\n${n.extra ?? ''}\nShow\n  BaseType "Gold"\n`, 'utf8')
    }
    return root
  }

  it('lists and ranks OnlineFilters entries', () => {
    const dir = seedOnline([
      { id: 'aaa', name: 'Random Vendor Filter' },
      { id: 'bbb', name: "NeverSink's filter 2 - Semi-Strict", extra: '# NeverSink' },
    ])
    const list = listFilterBladeCandidates(dir)
    expect(list[0].name).toContain('NeverSink')
    expect(list).toHaveLength(2)
  })

  it('returns needsSync when OnlineFilters is empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'scalpel-fb-empty-'))
    mkdirSync(join(root, 'OnlineFilters'), { recursive: true })
    const result = resolveFilterBladeLink(root)
    expect(result.ok).toBe(false)
    expect(result.needsSync).toBe(true)
  })

  it('resolves a local linked path for the top candidate', () => {
    const dir = seedOnline([{ id: 'xyz', name: 'NeverSink Soft' }])
    const result = resolveFilterBladeLink(dir)
    expect(result.ok).toBe(true)
    expect(result.linked?.localName).toBe('NeverSink Soft-local')
    expect(result.linked?.alreadyLinked).toBe(false)
  })

  it('maps OnlineFilters path to PoE item-filter URL', () => {
    const dir = seedOnline([{ id: 'rkY4jLfX', name: '9lives' }])
    const list = listFilterBladeCandidates(dir)
    const id = poeFilterIdFromOnlinePath(list[0].path)
    expect(id).toBe('rkY4jLfX')
    expect(poeItemFilterUrl(id!)).toBe('https://www.pathofexile.com/item-filter/rkY4jLfX')
  })
})

describe('helpers', () => {
  it('detects -local filter paths', () => {
    expect(isLinkedLocalFilterPath('C:\\x\\Foo-local.filter')).toBe(true)
    expect(isLinkedLocalFilterPath('C:\\x\\Foo.filter')).toBe(false)
  })

  it('builds FilterBlade and PoE ladder URLs per game', () => {
    expect(filterBladeUrl(2)).toContain('Poe2')
    expect(filterBladeUrl(1)).toContain('game=Poe')
    expect(poeItemFilterLadderUrl(2)).toContain('PoE2')
    expect(poeItemFilterLadderUrl(1)).toContain('PoE1')
  })
})
