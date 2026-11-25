import { afterEach, describe, expect, it } from 'vitest'
import { __resetLinuxDesktopForTests, getLinuxDesktop, setLinuxDesktop } from './desktop'

afterEach(() => __resetLinuxDesktopForTests())

describe('setLinuxDesktop', () => {
  it('applies a selectable desktop profile', () => {
    setLinuxDesktop('niri')
    expect(getLinuxDesktop()).toBe('niri')
  })

  it('falls back to auto for unknown or generic session names', () => {
    setLinuxDesktop('sway')
    setLinuxDesktop('gnome')
    expect(getLinuxDesktop()).toBe('auto')
  })
})
