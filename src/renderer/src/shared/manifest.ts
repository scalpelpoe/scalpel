import type { Manifest } from '@shared/types'

const EMPTY_MANIFEST: Manifest = { ninjaLeagues: { poe1: {}, poe2: {} }, poe2NinjaCategories: {} }

let cached: Manifest = EMPTY_MANIFEST

export function initManifest(m: Manifest): void {
  cached = m
}

export function getManifest(): Manifest {
  return cached
}
