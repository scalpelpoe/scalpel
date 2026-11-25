import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetLinuxInputBackendForTests,
  getLinuxInputBackend,
  setLinuxInputBackend,
  toLinuxInputBackend,
} from './input-backend'

describe('Linux input backend preference', () => {
  beforeEach(() => {
    __resetLinuxInputBackendForTests()
  })

  it('normalizes unknown values to auto', () => {
    expect(toLinuxInputBackend('nope')).toBe('auto')
    expect(toLinuxInputBackend('ydotool')).toBe('ydotool')
    expect(toLinuxInputBackend('wtype')).toBe('wtype')
    expect(toLinuxInputBackend('uiohook')).toBe('uiohook')
    expect(toLinuxInputBackend('compositor')).toBe('compositor')
  })

  it('stores the active backend', () => {
    expect(getLinuxInputBackend()).toBe('auto')
    setLinuxInputBackend('ydotool')
    expect(getLinuxInputBackend()).toBe('ydotool')
  })
})
