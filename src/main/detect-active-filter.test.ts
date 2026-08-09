import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  detectActiveFilter,
  detectedToListEntry,
  parseActiveItemFilterId,
  resolveFilterFolder,
} from './detect-active-filter'

describe('resolveFilterFolder', () => {
  it('resolves PoE2 and PoE1 folders', () => {
    expect(resolveFilterFolder(2, '/docs')).toBe(join('/docs', 'My Games', 'Path of Exile 2'))
    expect(resolveFilterFolder(1, '/docs')).toBe(join('/docs', 'My Games', 'Path of Exile'))
  })
})

describe('parseActiveItemFilterId', () => {
  it('prefers item_filter_loaded_successfully over item_filter', () => {
    const ini = 'item_filter=aaa\r\nitem_filter_loaded_successfully=bbb\r\n'
    expect(parseActiveItemFilterId(ini)).toBe('bbb')
  })

  it('falls back to item_filter', () => {
    expect(parseActiveItemFilterId('item_filter=rkY4jLfX\r\n')).toBe('rkY4jLfX')
  })

  it('returns null when unset', () => {
    expect(parseActiveItemFilterId('shadow_type=High\r\n')).toBeNull()
    expect(parseActiveItemFilterId('item_filter=\r\n')).toBeNull()
  })
})

describe('detectActiveFilter', () => {
  function setupPoe2(filterId: string, opts?: { onlineName?: string; localFilter?: string }) {
    const docs = mkdtempSync(join(tmpdir(), 'scalpel-detect-'))
    const game = join(docs, 'My Games', 'Path of Exile 2')
    mkdirSync(game, { recursive: true })
    writeFileSync(join(game, 'poe2_production_Config.ini'), `item_filter=${filterId}\r\n`, 'utf8')

    if (opts?.onlineName) {
      const online = join(game, 'OnlineFilters')
      mkdirSync(online, { recursive: true })
      writeFileSync(join(online, filterId), `#Online Item Filter\n#name:${opts.onlineName}\nShow\n`, 'utf8')
    }
    if (opts?.localFilter) {
      writeFileSync(join(game, opts.localFilter), 'Show\n', 'utf8')
    }
    return { docs, game }
  }

  it('resolves an OnlineFilters id to its #name header', () => {
    const { docs, game } = setupPoe2('rkY4jLfX', { onlineName: '9lives' })
    const result = detectActiveFilter(2, docs)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.detected).toMatchObject({
      filterDir: game,
      filterId: 'rkY4jLfX',
      name: '9lives',
      online: true,
      localCopyPath: null,
    })
    expect(result.detected.filterPath).toBe(join(game, 'OnlineFilters', 'rkY4jLfX'))
  })

  it('points localCopyPath at an existing Scalpel -local copy', () => {
    const { docs, game } = setupPoe2('rkY4jLfX', { onlineName: '9lives', localFilter: '9lives-local.filter' })
    const result = detectActiveFilter(2, docs)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.detected.localCopyPath).toBe(join(game, '9lives-local.filter'))
    expect(detectedToListEntry(result.detected)).toEqual({
      path: join(game, '9lives-local.filter'),
      name: '9lives-local',
      online: false,
    })
  })

  it('resolves a local .filter by id', () => {
    const { docs, game } = setupPoe2('MyStrict', { localFilter: 'MyStrict.filter' })
    const result = detectActiveFilter(2, docs)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.detected).toMatchObject({
      name: 'MyStrict',
      online: false,
      filterPath: join(game, 'MyStrict.filter'),
    })
  })

  it('errors when the active id is missing from disk', () => {
    const { docs } = setupPoe2('missingId')
    const result = detectActiveFilter(2, docs)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/missingId/)
  })

  it('still finds OnlineFilters when override points at a Neversink subfolder', () => {
    const { docs, game } = setupPoe2('rkY4jLfX', { onlineName: '9lives' })
    const neversink = join(game, 'Neversink')
    mkdirSync(neversink, { recursive: true })
    writeFileSync(join(neversink, 'Neversink_1_Regular.filter'), 'Show\n', 'utf8')

    const result = detectActiveFilter(2, docs, neversink)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.detected.name).toBe('9lives')
    expect(result.detected.online).toBe(true)
    expect(result.detected.filterDir).toBe(game)
  })

  it('errors when config is missing', () => {
    const docs = mkdtempSync(join(tmpdir(), 'scalpel-detect-empty-'))
    const result = detectActiveFilter(2, docs)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/config not found/i)
  })
})
