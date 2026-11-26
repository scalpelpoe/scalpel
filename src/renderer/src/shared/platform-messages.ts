import { m } from '@shared/paraglide/messages.js'

type MessageFn = (params?: Record<string, string | number>) => string
const messageFns = m as unknown as Record<string, MessageFn | undefined>

/** Descriptor message keys are resolved at render time so locale changes and
 *  keys supplied by @scalpel/platform stay localized in the app. */
export function platformMessage(key: string, params?: Record<string, string | number>): string {
  const fn = messageFns[key]
  return fn ? String(fn(params)) : key
}

/** `*LabelKey` params are message keys; everything else is already a value. */
export function resolvePlatformParams(params?: Readonly<Record<string, string>>): Record<string, string> {
  const resolved: Record<string, string> = {}
  for (const [name, value] of Object.entries(params ?? {})) {
    resolved[name.replace(/LabelKey$/, '')] = platformMessage(value)
  }
  return resolved
}
