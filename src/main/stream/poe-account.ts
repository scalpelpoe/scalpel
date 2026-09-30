/** Path of Exile accounts read "Name#1234"; poe.ninja's URLs spell them "Name-1234". */
const ACCOUNT = /^([^\s#/]+)[#-](\d{4})$/
const PROFILE_URL = /poe\.ninja\/poe2\/profile\/([^/?#\s]+)/i

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * What a streamer types or pastes (an account, poe.ninja's dashed form, or a poe.ninja
 * profile link) as "Name#1234". Text without a #1234 comes back trimmed, so the
 * publisher can say what's missing.
 */
export function normalizePoeAccount(input: string): string {
  const text = input.trim()
  const profile = PROFILE_URL.exec(text)
  const account = profile ? decode(profile[1]) : text
  const m = ACCOUNT.exec(account)
  return m ? `${m[1]}#${m[2]}` : account
}

/** poe.ninja's URL form of an account ("Name-1234"), or null without a #1234. */
export function ninjaAccountKey(account: string): string | null {
  const m = ACCOUNT.exec(account.trim())
  return m ? `${m[1]}-${m[2]}` : null
}
