import { describe, it, expect } from 'vitest'
import type { StatFilter } from './types'
import {
  BASE_DEFAULT_ITEM_CLASSES,
  CRAFTING_READY_EXCLUDED_CLASSES,
  applyBaseModeToFilters,
  applyCraftingReadyToFilters,
  isCraftingReadyState,
  isPerfectUniqueRoll,
  shouldIncludeImplicitsInBase,
} from './base-mode'

function f(overrides: Partial<StatFilter>): StatFilter {
  return {
    id: 'explicit.stat_x',
    text: 'test mod',
    value: 10,
    min: 10,
    max: null,
    enabled: true,
    type: 'explicit',
    ...overrides,
  }
}

describe('BASE_DEFAULT_ITEM_CLASSES', () => {
  it('contains Blueprints and Contracts', () => {
    expect(BASE_DEFAULT_ITEM_CLASSES.has('Blueprints')).toBe(true)
    expect(BASE_DEFAULT_ITEM_CLASSES.has('Contracts')).toBe(true)
  })

  it('does not contain ordinary equipment classes', () => {
    expect(BASE_DEFAULT_ITEM_CLASSES.has('Rings')).toBe(false)
    expect(BASE_DEFAULT_ITEM_CLASSES.has('Body Armours')).toBe(false)
    expect(BASE_DEFAULT_ITEM_CLASSES.has('Maps')).toBe(false)
  })
})

describe('shouldIncludeImplicitsInBase', () => {
  it('includes implicits for non-uniques', () => {
    expect(shouldIncludeImplicitsInBase('Rare', false)).toBe(true)
    expect(shouldIncludeImplicitsInBase('Magic', false)).toBe(true)
    expect(shouldIncludeImplicitsInBase('Normal', false)).toBe(true)
  })

  it('excludes implicits for uncorrupted uniques', () => {
    expect(shouldIncludeImplicitsInBase('Unique', false)).toBe(false)
  })

  it('includes implicits for corrupted uniques', () => {
    expect(shouldIncludeImplicitsInBase('Unique', true)).toBe(true)
  })
})

describe('applyBaseModeToFilters', () => {
  it('enables basetype and ilvl for non-uniques', () => {
    const input = [
      f({ id: 'misc.basetype', type: 'misc', enabled: false }),
      f({ id: 'misc.ilvl', type: 'misc', enabled: false }),
    ]
    const result = applyBaseModeToFilters(input, 'Rare', false)
    expect(result.find((x) => x.id === 'misc.basetype')!.enabled).toBe(true)
    const ilvl = result.find((x) => x.id === 'misc.ilvl')!
    expect(ilvl.enabled).toBe(true)
    expect(ilvl.chipState).toBe('min')
  })

  it('enables basetype but leaves ilvl off for uniques', () => {
    // Unique roll pools are fixed per item; ilvl just over-constrains the
    // search and hides valid listings.
    const input = [
      f({ id: 'misc.basetype', type: 'misc', enabled: false }),
      f({ id: 'misc.ilvl', type: 'misc', enabled: false }),
    ]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result.find((x) => x.id === 'misc.basetype')!.enabled).toBe(true)
    const ilvl = result.find((x) => x.id === 'misc.ilvl')!
    expect(ilvl.enabled).toBe(false)
    expect(ilvl.chipState).toBeUndefined()
  })

  it('disables explicit and pseudo filters', () => {
    const input = [
      f({ id: 'explicit.stat_life', type: 'explicit', enabled: true }),
      f({ id: 'pseudo.total_life', type: 'pseudo', enabled: true }),
    ]
    const result = applyBaseModeToFilters(input, 'Rare', false)
    expect(result.find((x) => x.id === 'explicit.stat_life')!.enabled).toBe(false)
    expect(result.find((x) => x.id === 'pseudo.total_life')!.enabled).toBe(false)
  })

  it('enables implicit/enchant for non-uniques', () => {
    const input = [
      f({ id: 'implicit.x', type: 'implicit', enabled: false }),
      f({ id: 'enchant.x', type: 'enchant', enabled: false }),
    ]
    const result = applyBaseModeToFilters(input, 'Rare', false)
    expect(result.find((x) => x.type === 'implicit')!.enabled).toBe(true)
    expect(result.find((x) => x.type === 'enchant')!.enabled).toBe(true)
  })

  it('disables implicit/enchant for uncorrupted uniques', () => {
    const input = [
      f({ id: 'implicit.x', type: 'implicit', enabled: true }),
      f({ id: 'enchant.x', type: 'enchant', enabled: true }),
    ]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result.find((x) => x.type === 'implicit')!.enabled).toBe(false)
    expect(result.find((x) => x.type === 'enchant')!.enabled).toBe(false)
  })

  it('enables implicit/enchant for corrupted uniques', () => {
    const input = [f({ id: 'implicit.x', type: 'implicit', enabled: false })]
    const result = applyBaseModeToFilters(input, 'Unique', true)
    expect(result.find((x) => x.type === 'implicit')!.enabled).toBe(true)
  })

  it('enables foulborn mods on uniques', () => {
    const input = [f({ id: 'explicit.stat_x', type: 'explicit', foulborn: true, enabled: false })]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result[0].enabled).toBe(true)
  })

  it('keeps premium mods enabled (not clobbered) while disabling ordinary explicits', () => {
    const input = [
      f({ id: 'explicit.stat_premium', type: 'explicit', premium: true, enabled: true }),
      f({ id: 'explicit.stat_other', type: 'explicit', enabled: true }),
    ]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result.find((r) => r.id === 'explicit.stat_premium')?.enabled).toBe(true)
    expect(result.find((r) => r.id === 'explicit.stat_other')?.enabled).toBe(false)
  })

  it('keeps the Mageblood Duplicates chip on by default (premium survives Base mode)', () => {
    const input = [
      f({ id: 'mageblood-duplicates', type: 'mageblood-dup', premium: true, enabled: true, value: 1, min: 1 }),
    ]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result.find((r) => r.id === 'mageblood-duplicates')?.enabled).toBe(true)
  })

  it('enables a perfect-or-over-rolled unique explicit pinned to the exact roll', () => {
    // perfectRoll covers both perfect and over-rolled; pin min to the actual value.
    const input = [
      f({ id: 'explicit.stat_x', type: 'explicit', enabled: false, value: 35, min: 27, max: null, perfectRoll: true }),
    ]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result[0].enabled).toBe(true)
    expect(result[0].min).toBe(35)
    expect(result[0].max).toBeNull()
  })

  it('leaves a non-perfect unique explicit disabled', () => {
    const input = [f({ id: 'explicit.stat_x', type: 'explicit', enabled: true, value: 25, perfectRoll: undefined })]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result[0].enabled).toBe(false)
  })

  it('does not auto-enable a perfect-rolled explicit on non-uniques', () => {
    const input = [f({ id: 'explicit.stat_x', type: 'explicit', enabled: true, value: 30, perfectRoll: true })]
    const result = applyBaseModeToFilters(input, 'Rare', false)
    expect(result[0].enabled).toBe(false)
  })

  it('a learned chip still overrides perfect-roll auto-enable', () => {
    const input = [
      f({ id: 'explicit.stat_x', type: 'explicit', enabled: false, learned: true, value: 30, perfectRoll: true }),
    ]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result[0].enabled).toBe(false)
  })

  it('does not special-case foulborn mods on non-uniques', () => {
    // Foulborn only triggers on unique items; on rare items they'd be disabled like any explicit
    const input = [f({ id: 'explicit.stat_x', type: 'explicit', foulborn: true, enabled: true })]
    const result = applyBaseModeToFilters(input, 'Rare', false)
    expect(result[0].enabled).toBe(false)
  })

  it('preserves socket/misc/timeless/fractured/currency/heist filters as-is', () => {
    const input = [
      f({ id: 'socket.links', type: 'socket', enabled: true }),
      f({ id: 'misc.quality', type: 'misc', enabled: false }),
      f({ id: 'timeless-any', type: 'timeless', enabled: true }),
      f({ id: 'fractured.x', type: 'fractured', enabled: true }),
      f({ id: 'misc.fractured', type: 'currency', enabled: false }),
      f({ id: 'heist.heist_wings', type: 'heist', enabled: true }),
    ]
    const result = applyBaseModeToFilters(input, 'Rare', false)
    // Each filter's enabled state is unchanged
    for (let i = 0; i < input.length; i++) {
      expect(result[i].enabled).toBe(input[i].enabled)
    }
  })

  it('preserves gem chips so base search on a transfigured gem still finds transfigured gems', () => {
    const input = [
      f({ id: 'misc.gem_level', type: 'gem', enabled: true }),
      f({ id: 'misc.gem_transfigured', type: 'gem', enabled: true }),
      f({ id: 'misc.quality', type: 'gem', enabled: false }),
    ]
    const result = applyBaseModeToFilters(input, 'Gem', false)
    for (let i = 0; i < input.length; i++) {
      expect(result[i].enabled).toBe(input[i].enabled)
    }
  })

  it('disables weapon DPS and defence filters', () => {
    const input = [
      f({ id: 'weapon.pdps', type: 'weapon', enabled: true }),
      f({ id: 'defence.armour', type: 'defence', enabled: true }),
    ]
    const result = applyBaseModeToFilters(input, 'Rare', false)
    expect(result.find((x) => x.type === 'weapon')!.enabled).toBe(false)
    expect(result.find((x) => x.type === 'defence')!.enabled).toBe(false)
  })

  it('preserves a learned chip so learning overrides base mode', () => {
    const input = [
      f({ id: 'explicit.stat_dexterity', type: 'explicit', enabled: true, learned: true }),
      f({ id: 'explicit.stat_life', type: 'explicit', enabled: true }),
    ]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    // learned chip keeps the engine-set enabled state...
    expect(result.find((x) => x.id === 'explicit.stat_dexterity')!.enabled).toBe(true)
    // ...while a non-learned explicit is still disabled by base mode
    expect(result.find((x) => x.id === 'explicit.stat_life')!.enabled).toBe(false)
  })

  it('preserves a learned chip the engine disabled', () => {
    const input = [f({ id: 'explicit.stat_coldres', type: 'explicit', enabled: false, learned: true })]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result[0].enabled).toBe(false)
    expect(result[0].learned).toBe(true)
  })

  it('premium explicit row stays enabled and bounds are not modified by the transform', () => {
    // Curated stat_list primary rows arrive premium: true, enabled: true; direction-lower rows
    // carry min: null, max: <bound>. Base mode must preserve all three fields untouched.
    const input = [
      f({ id: 'explicit.stat_premium_upper', type: 'explicit', premium: true, enabled: true, min: null, max: 42 }),
    ]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result[0].enabled).toBe(true)
    expect(result[0].min).toBeNull()
    expect(result[0].max).toBe(42)
  })

  it('mode-none row (enabled false, no premium) stays disabled through Base mode', () => {
    // Base mode force-disables non-structural rows; a row already disabled without premium
    // must remain disabled - Base mode must not inadvertently re-enable it.
    const input = [f({ id: 'explicit.stat_mode_none', type: 'explicit', enabled: false })]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result[0].enabled).toBe(false)
  })

  it('learned true wins over premium: disabled learned+premium row stays disabled', () => {
    // The adaptive engine's decision outranks the override layer. A row with learned: true
    // and enabled: false must stay disabled even when premium: true is set.
    const input = [f({ id: 'explicit.stat_x', type: 'explicit', premium: true, enabled: false, learned: true })]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result[0].enabled).toBe(false)
  })

  it('fixedRoll explicit without premium stays disabled through Base mode', () => {
    // Fixed-roll mods are excluded from direction/bound math but get no special enable path;
    // they fall into the "everything else disabled" branch like any plain explicit.
    const input = [f({ id: 'explicit.stat_fixed', type: 'explicit', fixedRoll: true, enabled: true })]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result[0].enabled).toBe(false)
  })
})

describe('isPerfectUniqueRoll', () => {
  it('is true for a flagged unique mod', () => {
    expect(isPerfectUniqueRoll(f({ perfectRoll: true }), 'Unique')).toBe(true)
  })

  it('is false when the flag is absent', () => {
    expect(isPerfectUniqueRoll(f({ perfectRoll: undefined }), 'Unique')).toBe(false)
  })

  it('is false for non-unique rarities even when flagged', () => {
    expect(isPerfectUniqueRoll(f({ perfectRoll: true }), 'Rare')).toBe(false)
  })
})

describe('applyCraftingReadyToFilters', () => {
  it('enables basetype, ilvl, and explicit affixes for a magic item', () => {
    const input = [
      f({ id: 'misc.basetype', type: 'misc', enabled: false }),
      f({ id: 'misc.ilvl', type: 'misc', enabled: false }),
      f({ id: 'explicit.stat_prefix', type: 'explicit', enabled: false }),
      f({ id: 'explicit.stat_suffix', type: 'explicit', enabled: false }),
    ]
    const result = applyCraftingReadyToFilters(input, 'Magic', false)
    expect(result.find((x) => x.id === 'misc.basetype')!.enabled).toBe(true)
    expect(result.find((x) => x.id === 'misc.ilvl')!.enabled).toBe(true)
    expect(result.find((x) => x.id === 'explicit.stat_prefix')!.enabled).toBe(true)
    expect(result.find((x) => x.id === 'explicit.stat_suffix')!.enabled).toBe(true)
  })

  it('leaves pseudo and defence off', () => {
    const input = [
      f({ id: 'pseudo.total_life', type: 'pseudo', enabled: true }),
      f({ id: 'defence.armour', type: 'defence', enabled: true }),
    ]
    const result = applyCraftingReadyToFilters(input, 'Magic', false)
    expect(result.find((x) => x.type === 'pseudo')!.enabled).toBe(false)
    expect(result.find((x) => x.type === 'defence')!.enabled).toBe(false)
  })

  it('preserves explicit min/max/value untouched (incl. beneficial-negative max)', () => {
    const input = [f({ id: 'explicit.stat_neg', type: 'explicit', enabled: false, value: -15, min: null, max: -15 })]
    const result = applyCraftingReadyToFilters(input, 'Magic', false)
    const chip = result.find((x) => x.id === 'explicit.stat_neg')!
    expect(chip.enabled).toBe(true)
    expect(chip.value).toBe(-15)
    expect(chip.min).toBeNull()
    expect(chip.max).toBe(-15)
  })

  it('degenerates to Base mode for a white item with no explicit chips', () => {
    const input = [
      f({ id: 'misc.basetype', type: 'misc', enabled: false }),
      f({ id: 'misc.ilvl', type: 'misc', enabled: false }),
    ]
    const cr = applyCraftingReadyToFilters(input, 'Normal', false)
    const base = applyBaseModeToFilters(input, 'Normal', false)
    expect(cr).toEqual(base)
  })

  it('preserves a learned chip over the preset', () => {
    const input = [
      f({ id: 'explicit.stat_dex', type: 'explicit', enabled: false, learned: true }),
      f({ id: 'explicit.stat_life', type: 'explicit', enabled: false }),
    ]
    const result = applyCraftingReadyToFilters(input, 'Magic', false)
    // learned chip keeps engine state (disabled)...
    expect(result.find((x) => x.id === 'explicit.stat_dex')!.enabled).toBe(false)
    // ...non-learned explicit is enabled by the preset
    expect(result.find((x) => x.id === 'explicit.stat_life')!.enabled).toBe(true)
  })

  it('enables the rarity chip to constrain the search to the same rarity', () => {
    const input = [
      f({ id: 'misc.basetype', type: 'misc', enabled: false }),
      f({ id: 'misc.rarity', text: 'Magic', type: 'misc', enabled: false }),
    ]
    const result = applyCraftingReadyToFilters(input, 'Magic', false)
    expect(result.find((x) => x.id === 'misc.rarity')!.enabled).toBe(true)
  })

  it('turns implicits off (base-derived) but keeps enchants on', () => {
    const input = [
      f({ id: 'implicit.x', type: 'implicit', enabled: true }),
      f({ id: 'enchant.x', type: 'enchant', enabled: false }),
    ]
    const result = applyCraftingReadyToFilters(input, 'Magic', false)
    expect(result.find((x) => x.type === 'implicit')!.enabled).toBe(false)
    expect(result.find((x) => x.type === 'enchant')!.enabled).toBe(true)
  })

  it('enables the open-affix chip for the strictly emptier side (suffix higher)', () => {
    // Magic item with a prefix only: Open Prefix (2), Open Suffix (3) -> suffix is emptier.
    const input = [
      f({
        id: 'pseudo.pseudo_number_of_empty_prefix_mods',
        text: 'Open Prefix (2)',
        type: 'misc',
        value: 2,
        enabled: false,
      }),
      f({
        id: 'pseudo.pseudo_number_of_empty_suffix_mods',
        text: 'Open Suffix (3)',
        type: 'misc',
        value: 3,
        enabled: false,
      }),
    ]
    const result = applyCraftingReadyToFilters(input, 'Magic', false)
    expect(result.find((x) => x.id === 'pseudo.pseudo_number_of_empty_suffix_mods')!.enabled).toBe(true)
    expect(result.find((x) => x.id === 'pseudo.pseudo_number_of_empty_prefix_mods')!.enabled).toBe(false)
  })

  it('enables the open-affix chip for the strictly emptier side (prefix higher)', () => {
    const input = [
      f({
        id: 'pseudo.pseudo_number_of_empty_prefix_mods',
        text: 'Open Prefix (3)',
        type: 'misc',
        value: 3,
        enabled: false,
      }),
      f({
        id: 'pseudo.pseudo_number_of_empty_suffix_mods',
        text: 'Open Suffix (2)',
        type: 'misc',
        value: 2,
        enabled: false,
      }),
    ]
    const result = applyCraftingReadyToFilters(input, 'Magic', false)
    expect(result.find((x) => x.id === 'pseudo.pseudo_number_of_empty_prefix_mods')!.enabled).toBe(true)
    expect(result.find((x) => x.id === 'pseudo.pseudo_number_of_empty_suffix_mods')!.enabled).toBe(false)
  })

  it('enables neither open-affix chip on a tie (fully-rolled magic item)', () => {
    // Magic item with both a prefix and a suffix: Open Prefix (2), Open Suffix (2) -> tie.
    const input = [
      f({
        id: 'pseudo.pseudo_number_of_empty_prefix_mods',
        text: 'Open Prefix (2)',
        type: 'misc',
        value: 2,
        enabled: false,
      }),
      f({
        id: 'pseudo.pseudo_number_of_empty_suffix_mods',
        text: 'Open Suffix (2)',
        type: 'misc',
        value: 2,
        enabled: false,
      }),
    ]
    const result = applyCraftingReadyToFilters(input, 'Magic', false)
    expect(result.find((x) => x.id === 'pseudo.pseudo_number_of_empty_prefix_mods')!.enabled).toBe(false)
    expect(result.find((x) => x.id === 'pseudo.pseudo_number_of_empty_suffix_mods')!.enabled).toBe(false)
  })
})

describe('CRAFTING_READY_EXCLUDED_CLASSES', () => {
  it('excludes PoE2 non-gear equipment classes', () => {
    expect(CRAFTING_READY_EXCLUDED_CLASSES.has('Waystones')).toBe(true)
    expect(CRAFTING_READY_EXCLUDED_CLASSES.has('Tablet')).toBe(true)
    expect(CRAFTING_READY_EXCLUDED_CLASSES.has('Relics')).toBe(true)
    expect(CRAFTING_READY_EXCLUDED_CLASSES.has('Flasks')).toBe(true)
  })

  it('does not exclude jewels or ordinary gear (they craft like gear)', () => {
    expect(CRAFTING_READY_EXCLUDED_CLASSES.has('Jewels')).toBe(false)
    expect(CRAFTING_READY_EXCLUDED_CLASSES.has('Rings')).toBe(false)
    expect(CRAFTING_READY_EXCLUDED_CLASSES.has('Body Armours')).toBe(false)
  })
})

describe('isCraftingReadyState', () => {
  it('is true for a freshly applied preset (incl. rarity chip enabled)', () => {
    const input = [
      f({ id: 'misc.basetype', type: 'misc', enabled: false }),
      f({ id: 'misc.ilvl', type: 'misc', enabled: false }),
      f({ id: 'misc.rarity', text: 'Magic', type: 'misc', enabled: false }),
      f({ id: 'explicit.stat_prefix', type: 'explicit', enabled: false }),
      f({ id: 'pseudo.total_life', type: 'pseudo', enabled: true }),
    ]
    const result = applyCraftingReadyToFilters(input, 'Magic', false)
    expect(isCraftingReadyState(result, true)).toBe(true)
  })

  it('is false when the rarity chip is unticked', () => {
    const input = [
      f({ id: 'misc.basetype', type: 'misc', enabled: true }),
      f({ id: 'misc.ilvl', type: 'misc', enabled: true }),
      f({ id: 'misc.rarity', text: 'Magic', type: 'misc', enabled: false }),
      f({ id: 'explicit.stat_prefix', type: 'explicit', enabled: true }),
    ]
    expect(isCraftingReadyState(input, true)).toBe(false)
  })

  it('stays true when a learned decision left the rarity chip off', () => {
    // The preset defers to learning for misc.rarity (it only flips !learned chips), so a
    // learned-off rarity must not un-highlight the chip -- otherwise no preset reads active.
    const input = [
      f({ id: 'misc.basetype', type: 'misc', enabled: true }),
      f({ id: 'misc.ilvl', type: 'misc', enabled: true }),
      f({ id: 'misc.rarity', text: 'Magic', type: 'misc', enabled: false, learned: true }),
      f({ id: 'explicit.stat_prefix', type: 'explicit', enabled: true }),
    ]
    expect(isCraftingReadyState(input, true)).toBe(true)
  })

  it('stays true when a learned pseudo is enabled on top of the preset', () => {
    // Repro of the amulet bug: total-life / resistance pseudos are commonly learned-on.
    // applyLearnedDecisions re-enables them over the preset; the chip must still read active.
    const input = [
      f({ id: 'misc.basetype', type: 'misc', enabled: false }),
      f({ id: 'misc.ilvl', type: 'misc', enabled: false }),
      f({ id: 'explicit.stat_life', type: 'explicit', enabled: false }),
      f({ id: 'pseudo.total_life', type: 'pseudo', enabled: false }),
    ]
    const result = applyCraftingReadyToFilters(input, 'Magic', false)
    const withLearnedPseudo = result.map((x) =>
      x.id === 'pseudo.total_life' ? { ...x, enabled: true, learned: true } : x,
    )
    expect(isCraftingReadyState(withLearnedPseudo, true)).toBe(true)
  })

  it('is false once an explicit chip is unticked', () => {
    const input = [
      f({ id: 'misc.basetype', type: 'misc', enabled: true }),
      f({ id: 'misc.ilvl', type: 'misc', enabled: true }),
      f({ id: 'explicit.stat_prefix', type: 'explicit', enabled: false }),
    ]
    expect(isCraftingReadyState(input, true)).toBe(false)
  })

  it('is false when a pseudo aggregate is still enabled', () => {
    const input = [
      f({ id: 'misc.basetype', type: 'misc', enabled: true }),
      f({ id: 'misc.ilvl', type: 'misc', enabled: true }),
      f({ id: 'explicit.stat_prefix', type: 'explicit', enabled: true }),
      f({ id: 'pseudo.total_life', type: 'pseudo', enabled: true }),
    ]
    expect(isCraftingReadyState(input, true)).toBe(false)
  })

  it('stays true when a learned explicit was left disabled by the preset', () => {
    // The adaptive engine can learn "do not price on this affix"; the preset preserves
    // that (learned wins), so a learned-off explicit must not break the active highlight.
    const input = [
      f({ id: 'misc.basetype', type: 'misc', enabled: false }),
      f({ id: 'misc.ilvl', type: 'misc', enabled: false }),
      f({ id: 'explicit.stat_prefix', type: 'explicit', enabled: false }),
      f({ id: 'explicit.stat_dex', type: 'explicit', enabled: false, learned: true }),
    ]
    const result = applyCraftingReadyToFilters(input, 'Magic', false)
    expect(result.find((x) => x.id === 'explicit.stat_dex')!.enabled).toBe(false)
    expect(isCraftingReadyState(result, true)).toBe(true)
  })
})
