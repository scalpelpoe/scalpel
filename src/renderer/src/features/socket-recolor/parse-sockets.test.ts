import { describe, expect, it } from 'vitest'
import { parseSocketString } from './parse-sockets'

describe('parseSocketString', () => {
  it('parses a fully linked group', () => {
    expect(parseSocketString('R-G-B')).toEqual({ colors: ['R', 'G', 'B'], linkedAfter: [0, 1] })
  })

  it('parses a linked group followed by an unlinked socket', () => {
    expect(parseSocketString('R-G B')).toEqual({ colors: ['R', 'G', 'B'], linkedAfter: [0] })
  })

  it('parses two fully linked groups', () => {
    expect(parseSocketString('B-B-G-G-R-R')).toEqual({
      colors: ['B', 'B', 'G', 'G', 'R', 'R'],
      linkedAfter: [0, 1, 2, 3, 4],
    })
  })

  it('drops an abyssal socket from a linked group', () => {
    expect(parseSocketString('R-G A')).toEqual({ colors: ['R', 'G'], linkedAfter: [0] })
  })

  it('drops a lone abyssal socket entirely', () => {
    expect(parseSocketString('A')).toEqual({ colors: [], linkedAfter: [] })
  })

  it('does not link across a dropped socket', () => {
    expect(parseSocketString('R-A-G')).toEqual({ colors: ['R', 'G'], linkedAfter: [] })
  })

  it('handles an empty socket string', () => {
    expect(parseSocketString('')).toEqual({ colors: [], linkedAfter: [] })
  })
})
