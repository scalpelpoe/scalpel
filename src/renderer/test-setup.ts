// Static import is required so the matcher type augmentation
// (toBeInTheDocument et al) is visible to .test.tsx files at compile time.
// jest-dom only patches `expect` matchers - no DOM access at import time -
// so it's harmless to load in the node env that .test.ts files run under.
import '@testing-library/jest-dom'

if (typeof window !== 'undefined') {
  let storage: Storage

  try {
    storage = typeof window.localStorage?.clear === 'function' ? window.localStorage : createMemoryStorage()
  } catch {
    // Some environments disable storage; keep tests on a small in-memory shim.
    storage = createMemoryStorage()
  }

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  })
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
}

function createMemoryStorage(): Storage {
  const data = new Map<string, string>()

  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  }
}
