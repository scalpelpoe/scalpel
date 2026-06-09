import { beforeEach, describe, expect, it } from 'vitest'
import { _setStatEntriesForTests } from '../index'
import { buildGrantsSkillFilters } from './grants-skill'

const RUNIC_TEMPERING_ENTRY = {
  id: 'skill.runic_tempering',
  text: 'Grants Skill: Level # Runic Tempering',
  type: 'skill',
}

const FROST_SHIELD_ENTRY = {
  id: 'skill.frost_shield',
  text: 'Grants Skill: Level # Frost Shield',
  type: 'skill',
}

beforeEach(() => {
  _setStatEntriesForTests([RUNIC_TEMPERING_ENTRY, FROST_SHIELD_ENTRY])
})

describe('buildGrantsSkillFilters', () => {
  it('returns empty array when itemInfo is undefined', () => {
    expect(buildGrantsSkillFilters(undefined)).toEqual([])
  })

  it('returns empty array when grantedSkills is empty', () => {
    expect(buildGrantsSkillFilters({ grantedSkills: [] })).toEqual([])
  })

  it('emits one filter for a single granted skill', () => {
    const filters = buildGrantsSkillFilters({
      grantedSkills: ['Grants Skill: Level 15 Runic Tempering'],
    })
    expect(filters).toHaveLength(1)
    const f = filters[0]
    expect(f.id).toBe('skill.runic_tempering')
    expect(f.text).toBe('Grants Skill: Runic Tempering')
    expect(f.value).toBe(15)
    expect(f.min).toBe(15)
    expect(f.max).toBeNull()
    expect(f.enabled).toBe(false)
    expect(f.type).toBe('skill')
  })

  it('emits two filters for two granted skills', () => {
    const filters = buildGrantsSkillFilters({
      grantedSkills: ['Grants Skill: Level 15 Runic Tempering', 'Grants Skill: Level 10 Frost Shield'],
    })
    expect(filters).toHaveLength(2)
    expect(filters[0].id).toBe('skill.runic_tempering')
    expect(filters[0].min).toBe(15)
    expect(filters[1].id).toBe('skill.frost_shield')
    expect(filters[1].min).toBe(10)
  })

  it('skips granted skills not present in the stat list', () => {
    const filters = buildGrantsSkillFilters({
      grantedSkills: ['Grants Skill: Level 5 Unknown Skill'],
    })
    expect(filters).toEqual([])
  })

  it('skips unmatched skills and keeps matched ones', () => {
    const filters = buildGrantsSkillFilters({
      grantedSkills: ['Grants Skill: Level 20 Unknown Skill', 'Grants Skill: Level 15 Runic Tempering'],
    })
    expect(filters).toHaveLength(1)
    expect(filters[0].id).toBe('skill.runic_tempering')
  })
})
