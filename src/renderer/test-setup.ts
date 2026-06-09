// Static import is required so the matcher type augmentation
// (toBeInTheDocument et al) is visible to .test.tsx files at compile time.
// jest-dom only patches `expect` matchers - no DOM access at import time -
// so it's harmless to load in the node env that .test.ts files run under.
import '@testing-library/jest-dom'

function installLocalStorageShim(): void {
  const store = new Map<string, string>()
  const localStorageShim: Storage = {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorageShim,
  })
}

if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
  installLocalStorageShim()
}
