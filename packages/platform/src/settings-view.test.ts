import { describe, expect, it } from 'vitest'
import { platformSettingsView } from './settings-view'

describe('platformSettingsView', () => {
  it('routes Linux hosts to the Linux settings view', () => {
    const view = platformSettingsView({ env: { platform: 'linux', env: {}, argv: ['scalpel'] } })
    expect(view.available).toBe(true)
    expect(view.sections[0].settings[0].id).toBe('displayMode')
  })

  it('hides the view on every other host', () => {
    for (const platform of ['win32', 'darwin'] as const) {
      expect(platformSettingsView({ env: { platform, env: {}, argv: ['scalpel'] } })).toEqual({
        available: false,
        sections: [],
      })
    }
  })
})
