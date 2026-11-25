/** Data-control clipboard offered by a layer-shell host. Wayland backends
 *  register one here; the Linux clipboard facade prefers it for `auto` and
 *  `compositor` when it is actually available. */
export interface CompositorClipboard {
  available(): boolean
  readText(): string
  readHTML(): string
  writeText(text: string): void
  write(data: { text?: string; html?: string }): void
  clear(): void
}

let registered: CompositorClipboard | null = null

export function registerCompositorClipboard(clipboard: CompositorClipboard | null): void {
  registered = clipboard
}

/** @internal Returns the registered clipboard only while it is usable. */
export function availableCompositorClipboard(): CompositorClipboard | null {
  return registered?.available() ? registered : null
}
