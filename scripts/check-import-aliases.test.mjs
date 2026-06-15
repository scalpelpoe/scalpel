import { describe, expect, it } from 'vitest'
import { areaOf, classify, processSource } from './check-import-aliases.mjs'

describe('areaOf', () => {
  it('classifies the three areas', () => {
    expect(areaOf('src/shared/types.ts')).toBe('shared')
    expect(areaOf('src/main/overlay.ts')).toBe('main')
    expect(areaOf('src/renderer/src/overlay/App.tsx')).toBe('renderer')
  })

  it('treats renderer-local shared as renderer, not the top-level shared area', () => {
    expect(areaOf('src/renderer/src/shared/locale.tsx')).toBe('renderer')
  })

  it('treats preload / resources / plugin-sdk as other', () => {
    expect(areaOf('src/preload/index.ts')).toBe('other')
    expect(areaOf('resources/icon.png')).toBe('other')
    expect(areaOf('plugin-sdk/src/types.ts')).toBe('other')
  })
})

describe('classify - reaching into shared must use @shared', () => {
  it('rewrites a one-level relative shared import', () => {
    expect(classify('src/main/diagnostics.ts', '../shared/types')).toEqual({
      kind: 'fix',
      replacement: '@shared/types',
    })
  })

  it('rewrites a deep relative shared import', () => {
    expect(classify('src/main/filter/parser.ts', '../../shared/types')).toEqual({
      kind: 'fix',
      replacement: '@shared/types',
    })
  })

  it('rewrites from a renderer file too', () => {
    expect(
      classify('src/renderer/src/shared/platform/api/settings.ts', '../../../../../shared/contracts/settings'),
    ).toEqual({ kind: 'fix', replacement: '@shared/contracts/settings' })
  })

  it('leaves an already-aliased shared import alone', () => {
    expect(classify('src/main/diagnostics.ts', '@shared/types')).toEqual({ kind: 'ok' })
  })

  it('rewrites preload imports into shared', () => {
    expect(classify('src/preload/index.ts', '../shared/types')).toEqual({
      kind: 'fix',
      replacement: '@shared/types',
    })
  })
})

describe('classify - intra-area depth threshold', () => {
  it('keeps shallow same-area relatives (<= 2 levels)', () => {
    expect(classify('src/renderer/src/features/settings/SettingsPanel.tsx', './tabs/GeneralTab')).toEqual({
      kind: 'ok',
    })
    expect(classify('src/renderer/src/features/settings/tabs/GeneralTab.tsx', '../../components/Toggle')).toEqual({
      kind: 'ok',
    })
  })

  it('rewrites a deep same-area relative (3+ levels) to the area alias', () => {
    expect(
      classify('src/renderer/src/features/settings/tabs/MacrosTab.tsx', '../../../components/primitives/HotkeyField'),
    ).toEqual({ kind: 'fix', replacement: '@renderer/components/primitives/HotkeyField' })
  })

  it('rewrites a deep main-internal relative', () => {
    expect(classify('src/main/trade/stat-matcher/producers/foo.ts', '../../../game-state')).toEqual({
      kind: 'fix',
      replacement: '@main/game-state',
    })
  })

  it('rebuilds from the area root when the climb stops short of it', () => {
    // 3 levels up from .../tabs/cheatsheets/ lands at features/, not the root.
    expect(
      classify('src/renderer/src/features/settings/tabs/cheatsheets/CategoryCard.tsx', '../../../shared/constants'),
    ).toEqual({ kind: 'fix', replacement: '@renderer/features/shared/constants' })
  })
})

describe('classify - forbidden dependency directions are hard errors', () => {
  it('flags renderer importing main (relative)', () => {
    expect(classify('src/renderer/src/a/b.tsx', '../../../main/game-state').kind).toBe('error')
  })

  it('flags renderer importing main (alias)', () => {
    expect(classify('src/renderer/src/a/b.tsx', '@main/game-state').kind).toBe('error')
  })

  it('flags main importing renderer (alias)', () => {
    expect(classify('src/main/overlay.ts', '@renderer/overlay/App').kind).toBe('error')
  })

  it('flags shared importing main', () => {
    expect(classify('src/shared/types.ts', '../main/game-state').kind).toBe('error')
  })

  it('does not auto-fix forbidden imports', () => {
    expect(classify('src/renderer/src/a/b.tsx', '@main/game-state').replacement).toBeUndefined()
  })
})

describe('classify - out of scope', () => {
  it('leaves external packages alone', () => {
    expect(classify('src/main/overlay.ts', 'electron')).toEqual({ kind: 'ok' })
  })

  it('leaves imports into non-aliased trees (resources) relative', () => {
    expect(classify('src/renderer/src/a/b.tsx', '../../../../resources/icon.png')).toEqual({ kind: 'ok' })
  })
})

describe('processSource', () => {
  const file = 'src/main/handlers/prices.ts'
  const src = [
    "import { ipcMain } from 'electron'",
    "import divCardsData from '../../shared/data/economy/div-cards.json'",
    "import { findMatchingBlocks } from '../filter/matcher'",
    "import type { PoeItem } from '@shared/types'",
  ].join('\n')

  it('reports the one out-of-convention import with a line number', () => {
    const { violations } = processSource(file, src, false)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({
      line: 2,
      kind: 'fix',
      replacement: '@shared/data/economy/div-cards.json',
    })
  })

  it('rewrites only that import under --fix and is idempotent', () => {
    const { text } = processSource(file, src, true)
    expect(text).toContain("from '@shared/data/economy/div-cards.json'")
    expect(text).toContain("from '../filter/matcher'") // same-area shallow, untouched
    expect(text).toContain("from 'electron'")
    // Running again finds nothing to fix.
    expect(processSource(file, text, true).violations.filter((v) => v.kind === 'fix')).toHaveLength(0)
  })

  it('handles dynamic import() and side-effect specifiers', () => {
    const dyn = "const x = await import('../../shared/plugin-registry-types')"
    expect(processSource('src/main/handlers/plugins.ts', dyn, false).violations[0]).toMatchObject({
      kind: 'fix',
      replacement: '@shared/plugin-registry-types',
    })
  })
})
