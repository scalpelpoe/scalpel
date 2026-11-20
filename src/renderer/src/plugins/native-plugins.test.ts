import { describe, expect, it } from 'vitest'
import type { RegistryEntry } from '@shared/plugin-registry-types'
import { isNativeRegistryEntry } from './native-plugins'

const entry = (assets?: Record<string, string>): RegistryEntry =>
  ({
    id: 'demo',
    name: 'Demo',
    author: 'a',
    description: 'd',
    repo: 'o/r',
    latestVersion: '1.0.0',
    scalpelMinVersion: '>=1.0.0',
    sha256: 'a'.repeat(64),
    assets,
  }) as RegistryEntry

describe('isNativeRegistryEntry', () => {
  it('is false when the entry has no assets', () => {
    expect(isNativeRegistryEntry(entry())).toBe(false)
  })

  it('is false when assets contains only a .binpb contract file', () => {
    expect(isNativeRegistryEntry(entry({ 'backend.binpb': 'a'.repeat(64) }))).toBe(false)
  })

  it('is true when assets pins a .exe file', () => {
    expect(isNativeRegistryEntry(entry({ 'backend.exe': 'a'.repeat(64) }))).toBe(true)
  })

  it('is true regardless of the .exe extension case', () => {
    expect(isNativeRegistryEntry(entry({ 'backend.EXE': 'a'.repeat(64) }))).toBe(true)
  })
})
