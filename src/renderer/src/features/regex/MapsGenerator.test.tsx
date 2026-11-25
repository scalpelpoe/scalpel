// @vitest-environment jsdom
import { createRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegexPreset } from '@shared/types'
import type { GeneratorHandle } from './generator-types'
import { MapsGenerator } from './MapsGenerator'

function openMaps() {
  const ref = createRef<GeneratorHandle>()
  const onRegexChange = vi.fn<(regex: string) => void>()
  render(
    <MapsGenerator
      ref={ref}
      onRegexChange={onRegexChange}
      onAutoTagsChange={vi.fn()}
      sharedSaveChip={null}
      sharedLoadChip={null}
      sharedNewChip={null}
      sharedSavePanel={null}
      sharedSavedPresets={null}
    />,
  )
  return { ref, regex: () => onRegexChange.mock.lastCall![0] }
}

// PoE ANDs quoted search terms. Each term matches individual lines, and ! negates a term.
function matchesMap(regex: string, currency: number, rarity: number, mod = '') {
  const lines = [`More Currency: +${currency}% (augmented)`, `Item Rarity: +${rarity}% (augmented)`, mod]
  return [...regex.matchAll(/"(!?)([^"]+)"/g)].every(
    ([, negate, pattern]) => lines.some((line) => new RegExp(pattern, 'i').test(line)) !== Boolean(negate),
  )
}

describe('Maps reward optimizer', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('api', { onRateLimit: () => () => {} })
  })

  it('matches both inclusive totals, ranks contributors and lets the player veto one', () => {
    const { ref, regex } = openMaps()
    fireEvent.click(screen.getByRole('button', { name: 'Optimize' }))
    expect(ref.current!.getPresetPayload()).toMatchObject({
      qualifiers: { morecurrency: 90, rarity: 70 },
      avoid: [],
      want: [],
    })
    expect(screen.getAllByRole('checkbox')[0]).toHaveTextContent('Debuffs on Monsters expire')
    expect(matchesMap(regex(), 90, 70)).toBe(true)
    expect(matchesMap(regex(), 89, 100)).toBe(false)
    expect(matchesMap(regex(), 100, 69)).toBe(false)
    expect(matchesMap(regex(), 125, 108)).toBe(true)

    const block = screen.getByRole('checkbox', { name: /Chance to Block Attack Damage.*47% More Currency/ })
    fireEvent.click(block)
    expect(matchesMap(regex(), 94, 72, 'Monsters have +50% Chance to Block Attack Damage')).toBe(false)
    expect(matchesMap(regex(), 94, 72, 'Debuffs on Monsters expire 100% faster')).toBe(true)
    expect(ref.current!.getPresetPayload().avoid).toEqual([-1940135977])
    fireEvent.keyDown(block, { key: ' ' })
    expect(matchesMap(regex(), 94, 72, 'Monsters have +50% Chance to Block Attack Damage')).toBe(true)
  })

  it('uses custom minimums and preserves existing preset constraints when ranking', () => {
    const { ref, regex } = openMaps()
    const preset: RegexPreset = {
      id: 'custom',
      name: 'Threads',
      regex: '',
      avoid: [1305115176],
      want: [583869527],
      wantMode: 'all',
      qualifiers: { morescarabs: 43, quality: 18 },
      nightmare: false,
    }
    act(() => ref.current!.applyPreset(preset))
    const original = regex()
    fireEvent.click(screen.getByRole('button', { name: 'Optimize' }))
    expect(regex()).toBe(original)
    expect(ref.current!.getPresetPayload()).toMatchObject({
      qualifiers: preset.qualifiers,
      avoid: preset.avoid,
      want: preset.want,
      wantMode: 'all',
    })
    expect(screen.getByText('More Threads ≥43%')).toBeVisible()
    expect(screen.getAllByRole('checkbox')[0]).toHaveTextContent('More Threads')
    fireEvent.click(screen.getByRole('button', { name: /Want/ }))
    expect(screen.getByRole('checkbox', { name: /increased Magic Monsters/ })).toHaveTextContent('Pack Size')
  })
})
