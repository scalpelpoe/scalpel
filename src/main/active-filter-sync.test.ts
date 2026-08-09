import { describe, expect, it } from 'vitest'
import { filterIdFromScalpelPath, setItemFilterInConfig } from './active-filter-sync'

describe('setItemFilterInConfig', () => {
  it('updates existing item_filter and loaded keys', () => {
    const ini = ['[UI]', 'item_filter=oldId', 'item_filter_loaded_successfully=oldId', ''].join('\r\n')
    expect(setItemFilterInConfig(ini, 'rkY4jLfX')).toBe(
      ['[UI]', 'item_filter=rkY4jLfX', 'item_filter_loaded_successfully=rkY4jLfX', ''].join('\r\n'),
    )
  })

  it('appends item_filter when missing', () => {
    const ini = 'shadow_type=High\n'
    expect(setItemFilterInConfig(ini, 'MyFilter')).toContain('item_filter=MyFilter')
  })
})

describe('filterIdFromScalpelPath', () => {
  it('uses OnlineFilters basename for online files', () => {
    expect(
      filterIdFromScalpelPath(
        'C:\\Users\\x\\Documents\\My Games\\Path of Exile 2\\OnlineFilters\\rkY4jLfX',
        'C:\\Users\\x\\Documents\\My Games\\Path of Exile 2',
      ),
    ).toBe('rkY4jLfX')
  })

  it('strips .filter for local files', () => {
    expect(
      filterIdFromScalpelPath(
        'C:\\Users\\x\\Documents\\My Games\\Path of Exile 2\\9lives-local.filter',
        'C:\\Users\\x\\Documents\\My Games\\Path of Exile 2',
      ),
    ).toBe('9lives-local')
  })
})
