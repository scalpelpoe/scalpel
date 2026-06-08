/**
 * Renderer API adapter for cheat sheets operations.
 *
 * Preparatory wrappers around window.api. Existing renderer code still calls the
 * preload bridge directly; migrate call sites incrementally when touching cheat
 * sheet screens.
 */

export function addCheatSheetFromFile(categoryId: string): Promise<Array<{ id: string; ext: string }>> {
  return window.api.addCheatSheetFromFile(categoryId)
}

export function addCheatSheetFromUrl(categoryId: string, url: string): Promise<{ id: string; ext: string }> {
  return window.api.addCheatSheetFromUrl(categoryId, url)
}

export function removeCheatSheet(categoryId: string, sheetId: string, ext: string): Promise<void> {
  return window.api.removeCheatSheet(categoryId, sheetId, ext)
}

export function removeCheatSheetCategory(categoryId: string): Promise<void> {
  return window.api.removeCheatSheetCategory(categoryId)
}

export function listCheatSheetPrefabs(): Promise<
  Array<{ slug: string; name: string; imageCount: number; poeVersion?: 1 | 2 }>
> {
  return window.api.listCheatSheetPrefabs()
}

export function importCheatSheetPrefab(
  slug: string,
): Promise<{ categoryId: string; sheets: Array<{ id: string; ext: string; areaCodes?: string[] }> }> {
  return window.api.importCheatSheetPrefab(slug)
}

export function pinnedZoneSetVisible(visible: boolean): void {
  window.api.pinnedZoneSetVisible(visible)
}

export function pinnedZoneSetContentHeight(height: number): void {
  window.api.pinnedZoneSetContentHeight(height)
}

export function closeCheatSheets(): void {
  window.api.closeCheatSheets()
}

export function minimizeCheatSheets(): void {
  window.api.minimizeCheatSheets()
}

export function restoreCheatSheets(): void {
  window.api.restoreCheatSheets()
}

export function showCheatSheetPreview(src: string): void {
  window.api.showCheatSheetPreview(src)
}

export function hideCheatSheetPreview(): void {
  window.api.hideCheatSheetPreview()
}

export function onCheatSheetFocusCategory(cb: (categoryId: string | undefined) => void): () => void {
  return window.api.onCheatSheetFocusCategory(cb)
}

export function onCheatSheetPreview(cb: (state: { src: string | null }) => void): () => void {
  return window.api.onCheatSheetPreview(cb)
}

export function onSecondaryOverlaySnapGhost(
  cb: (rect: { x: number; y: number; width: number; height: number } | null) => void,
): () => void {
  return window.api.onSecondaryOverlaySnapGhost(cb)
}
