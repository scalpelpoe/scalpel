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

  it('routes unpacked removal through its development endpoint', () => {
    expect(validateUninstallPrecondition('demo', new Set(['demo']), new Set(['demo']))).toMatch(/Developer settings/)
    expect(validateUninstallPrecondition('missing', new Set(), new Set())).toMatch(/not installed/)
  })
})
