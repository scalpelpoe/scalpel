/** "now" / "12m" / "3h" / "2d". */
export function ageShort(iso: string, now: number): string {
  const ms = now - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 60_000) return 'now'
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/** "just now" / "12m ago" / "3h ago" / "2d ago". */
export function ageText(iso: string, now: number): string {
  const short = ageShort(iso, now)
  return short === 'now' ? 'just now' : `${short} ago`
}

export function ageMs(iso: string, now: number): number {
  const ms = now - Date.parse(iso)
  return Number.isFinite(ms) ? ms : 0
}
