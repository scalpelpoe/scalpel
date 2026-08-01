/** Escape an arbitrary element id for use in a Konva `findOne('#'+id)` selector. */
export function cssEscape(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)
}
