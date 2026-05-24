// Static import is required so the matcher type augmentation
// (toBeInTheDocument et al) is visible to .test.tsx files at compile time.
// jest-dom only patches `expect` matchers - no DOM access at import time -
// so it's harmless to load in the node env that .test.ts files run under.
import '@testing-library/jest-dom'
