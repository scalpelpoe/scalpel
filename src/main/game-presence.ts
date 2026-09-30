/** Whether the overlay is attached to a running game window. Lives outside
 *  overlay.ts (like game-state.ts) so consumers such as the stream publisher can
 *  read it without pulling the native overlay modules into their import graph.
 *  Set from the overlay's attach/detach handlers. */

type Listener = (attached: boolean) => void

let attached = false
const listeners = new Set<Listener>()

export function isGameAttached(): boolean {
  return attached
}

export function setGameAttached(next: boolean): void {
  if (next === attached) return
  attached = next
  for (const listener of listeners) listener(next)
}

export function onGameAttachedChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
