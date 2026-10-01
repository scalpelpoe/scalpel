export function debugWarn(...args: unknown[]): void {
  if (process.env.SCALPEL_DEBUG_LOG) console.warn('[stream]', ...args)
}
