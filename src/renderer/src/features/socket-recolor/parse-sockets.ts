/**
 * Parses a clipboard socket string (e.g. "R-G-B A") into the flat colour list and
 * link graph the socket recolor picker renders.
 *
 * Chromatic Orbs cannot touch abyssal ('A') or resonator ('D') sockets, so those are
 * dropped entirely: they neither count toward the socket total nor break/extend a
 * link between the sockets that remain.
 */

export interface ParsedSockets {
  /** One entry per recolourable socket, as 'R' | 'G' | 'B' | 'W'. */
  colors: string[]
  /** Indices into `colors` that are linked to the next socket. */
  linkedAfter: number[]
}

const RECOLORABLE = new Set(['R', 'G', 'B', 'W'])

export function parseSocketString(sockets: string): ParsedSockets {
  const colors: string[] = []
  const linkedAfter: number[] = []

  for (const group of sockets.split(' ').filter(Boolean)) {
    const socks = group.split('-')
    let prevKeptIndex: number | null = null
    for (const s of socks) {
      if (!RECOLORABLE.has(s)) {
        prevKeptIndex = null
        continue
      }
      if (prevKeptIndex !== null) linkedAfter.push(prevKeptIndex)
      prevKeptIndex = colors.length
      colors.push(s)
    }
  }

  return { colors, linkedAfter }
}
