import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { ALERT_SOUNDS } from '@shared/data/filter/filter-actions'
import { alertSoundUrl } from './alert-sound-url'

// Guards the relative asset path: moving this directory silently broke the preview
// once already, and Audio load failures are swallowed by the play() catch.
describe('alertSoundUrl', () => {
  it('resolves every built-in alert sound to a file that exists', () => {
    for (const sound of ALERT_SOUNDS) {
      const url = alertSoundUrl(sound.id)
      expect(existsSync(fileURLToPath(url)), `sound ${sound.id} -> ${url}`).toBe(true)
    }
  })
})
