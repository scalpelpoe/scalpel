/** Resolves a built-in alert sound id to the bundled asset URL the preview button plays.
    Lives next to its consumer because the path is relative to this module's location. */
export function alertSoundUrl(id: string): string {
  const paddedId = id.padStart(2, '0')
  return new URL(`../../../assets/sounds/AlertSound_${paddedId}.ogg`, import.meta.url).href
}
