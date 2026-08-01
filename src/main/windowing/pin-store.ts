import Store from 'electron-store'

interface PinStoreSchema {
  pins: Record<string, boolean>
}

// Own store file (not the main config store) so two electron-store instances
// never race on the same json. Lazy-init keeps module import side-effect free
// for tests and boot ordering.
let store: Store<PinStoreSchema> | null = null

function getStore(): Store<PinStoreSchema> {
  if (!store) {
    store = new Store<PinStoreSchema>({ name: 'scalpel-overlay-pins', defaults: { pins: {} } })
  }
  return store
}

export function readOverlayPinned(id: string): boolean {
  return getStore().get('pins')[id] === true
}

export function writeOverlayPinned(id: string, pinned: boolean): void {
  const pins = { ...getStore().get('pins') }
  if (pinned) {
    pins[id] = true
  } else {
    delete pins[id]
  }
  getStore().set('pins', pins)
}
