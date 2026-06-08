import { describe, it, expect } from 'vitest'
import { generateFlaskOutput, minItemLevel } from './flask-engine'
import type { FlaskSettings } from './flask-engine'
import type { FlaskModGroup } from '../../../../shared/data/regex/flask-mods'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGroup(
  description: string,
  groupRegex: string,
  minLevel: number,
  mods: { level: number; regex: string }[],
): FlaskModGroup {
  return {
    description,
    regex: groupRegex,
    minLevel,
    tag: { name: 'default', sort: 0, color: '#fff' },
    mods: mods.map((m) => ({ level: m.level, name: '', value: '', regex: m.regex })),
  }
}

const GROUP_A = makeGroup('Prefix A', 'pfxa', 8, [
  { level: 80, regex: 'pfxa-hi' },
  { level: 40, regex: 'pfxa-lo' },
])

const GROUP_B = makeGroup('Suffix B', 'sufb', 10, [
  { level: 70, regex: 'sufb-hi' },
  { level: 30, regex: 'sufb-lo' },
])

// A "reduced Duration" group used for the ignoreEffectTiers tests.
const GROUP_DURATION = makeGroup('reduced Duration effect', 'dur', 4, [
  { level: 40, regex: 'dur-hi' },
  { level: 10, regex: 'dur-lo' },
])

const ALL_GROUPS = [GROUP_A, GROUP_B, GROUP_DURATION]

function defaults(): FlaskSettings {
  return {
    selectedPrefix: [],
    selectedSuffix: [],
    ilevel: 85,
    flaskHighestOnly: false,
    matchBothPrefixAndSuffix: false,
    ignoreEffectTiers: false,
    matchOpenPrefixSuffix: false,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateFlaskOutput', () => {
  it('returns empty string when nothing is selected', () => {
    expect(generateFlaskOutput(ALL_GROUPS, defaults())).toBe('')
  })

  it('returns quoted group regex for one prefix at default ilevel', () => {
    const settings = { ...defaults(), selectedPrefix: ['Prefix A'] }
    expect(generateFlaskOutput(ALL_GROUPS, settings)).toBe('"pfxa"')
  })

  it('returns quoted group regex for one suffix at default ilevel', () => {
    const settings = { ...defaults(), selectedSuffix: ['Suffix B'] }
    expect(generateFlaskOutput(ALL_GROUPS, settings)).toBe('"sufb"')
  })

  it('unions prefix and suffix into one quoted string without matchBothPrefixAndSuffix', () => {
    const settings = {
      ...defaults(),
      selectedPrefix: ['Prefix A'],
      selectedSuffix: ['Suffix B'],
      matchBothPrefixAndSuffix: false,
    }
    expect(generateFlaskOutput(ALL_GROUPS, settings)).toBe('"pfxa|sufb"')
  })

  it('emits two quoted strings when matchBothPrefixAndSuffix is true', () => {
    const settings = {
      ...defaults(),
      selectedPrefix: ['Prefix A'],
      selectedSuffix: ['Suffix B'],
      matchBothPrefixAndSuffix: true,
    }
    expect(generateFlaskOutput(ALL_GROUPS, settings)).toBe('"pfxa" "sufb"')
  })

  it('prepends open-affix tokens when matchBothPrefixAndSuffix + matchOpenPrefixSuffix', () => {
    const settings = {
      ...defaults(),
      selectedPrefix: ['Prefix A'],
      selectedSuffix: ['Suffix B'],
      matchBothPrefixAndSuffix: true,
      matchOpenPrefixSuffix: true,
    }
    expect(generateFlaskOutput(ALL_GROUPS, settings)).toBe('"^[a-z]+ F|pfxa" "ask$|sufb"')
  })

  it('uses highest-tier mod regex when flaskHighestOnly is true', () => {
    // GROUP_A has mods at level 80 (pfxa-hi) and 40 (pfxa-lo). At ilevel 85 the
    // highest eligible tier is level 80, so pfxa-hi must be in the output.
    const settings = {
      ...defaults(),
      selectedPrefix: ['Prefix A'],
      flaskHighestOnly: true,
    }
    expect(generateFlaskOutput(ALL_GROUPS, settings)).toBe('"pfxa-hi"')
  })

  it('drops a group entirely when flaskHighestOnly and ilevel is below the group minLevel', () => {
    // GROUP_A minLevel is 8, but all its mods are at level 40+. With ilevel 5 no
    // mods qualify, so the group is dropped and the output is empty.
    const settings = {
      ...defaults(),
      selectedPrefix: ['Prefix A'],
      flaskHighestOnly: true,
      ilevel: 5,
    }
    expect(generateFlaskOutput(ALL_GROUPS, settings)).toBe('')
  })

  it('collapses tiered effect regexes back to group regex when ignoreEffectTiers is true', () => {
    // With flaskHighestOnly the duration group would produce "dur-hi". Enabling
    // ignoreEffectTiers should replace that with the group-level regex "dur".
    const settings = {
      ...defaults(),
      selectedPrefix: ['reduced Duration effect'],
      flaskHighestOnly: true,
      ignoreEffectTiers: true,
    }
    expect(generateFlaskOutput(ALL_GROUPS, settings)).toBe('"dur"')
  })
})

describe('minItemLevel', () => {
  it('returns undefined when flaskHighestOnly is false', () => {
    const settings = { ...defaults(), selectedPrefix: ['Prefix A'] }
    expect(minItemLevel(ALL_GROUPS, settings)).toBeUndefined()
  })

  it('returns the minimum item level string when flaskHighestOnly is true', () => {
    // GROUP_A: highest eligible mod at ilevel 85 is level 80.
    // GROUP_B: highest eligible mod at ilevel 85 is level 70.
    // Math.max(80, 70) = 80, so the warning says level 80.
    const settings = {
      ...defaults(),
      selectedPrefix: ['Prefix A'],
      selectedSuffix: ['Suffix B'],
      flaskHighestOnly: true,
    }
    expect(minItemLevel(ALL_GROUPS, settings)).toBe('minimum flask item level: 80')
  })
})
