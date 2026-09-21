import { describe, expect, it } from 'vitest'
import { validateRegistryMutationPrecondition, validateUninstallPrecondition } from './mutation-preconditions'

describe('plugin mutation endpoint preconditions', () => {
  it('keeps install and update semantics distinct', () => {
    expect(validateRegistryMutationPrecondition('install', 'demo', new Set(['demo']), new Set())).toMatch(
      /already installed/,
    )
    expect(validateRegistryMutationPrecondition('update', 'demo', new Set(), new Set())).toMatch(/not installed/)
  })

  it('does not let registry update replace an unpacked development plugin', () => {
    expect(validateRegistryMutationPrecondition('update', 'demo', new Set(['demo']), new Set(['demo']))).toMatch(
      /unpacked/,
    )
  })

  it('rejects uninstalling a plugin that is not installed', () => {
    expect(validateUninstallPrecondition('demo', new Set(['demo']))).toBeNull()
    expect(validateUninstallPrecondition('missing', new Set())).toMatch(/not installed/)
  })
})
