import type { ColorFreqMap } from './types'

let cachedColorFreqs: ColorFreqMap | null = null
let colorFreqPromise: Promise<ColorFreqMap> | null = null

export function getColorFreqs(): Promise<ColorFreqMap> {
  if (cachedColorFreqs) return Promise.resolve(cachedColorFreqs)
  if (!colorFreqPromise) {
    colorFreqPromise = window.api.getColorFrequencies().then((freqs) => {
      cachedColorFreqs = freqs
      colorFreqPromise = null
      return freqs
    })
  }
  return colorFreqPromise
}

/** Called after filter edits to bust the cache */
export function invalidateColorFreqCache(): void {
  cachedColorFreqs = null
}
