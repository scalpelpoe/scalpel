import { describe, expect, it } from 'vitest'
import { parseClientLogLine } from './parse-client-log'

describe('parseClientLogLine', () => {
  it('parses a PoE1 area-generation line', () => {
    const line =
      '2026/05/11 13:14:15 1234567 abc [DEBUG Client 12345] Generating level 68 area "MapWorldsAtoll" with seed 1731819442'
    expect(parseClientLogLine(line)).toEqual({ areaLevel: 68, areaCode: 'MapWorldsAtoll' })
  })

  it('parses a PoE2 area-generation line', () => {
    const line = '2026/05/11 13:14:15 1234567 abc [DEBUG Client 12345] Generating level 5 area "G1_1_2" with seed 42'
    expect(parseClientLogLine(line)).toEqual({ areaLevel: 5, areaCode: 'G1_1_2' })
  })

  it('returns null for non-matching lines', () => {
    expect(parseClientLogLine('2026/05/11 13:14:15 1234567 abc some other log line')).toBeNull()
    expect(parseClientLogLine('')).toBeNull()
  })

  it('returns null for level 0 (cutscenes / login areas)', () => {
    const line = '[DEBUG Client 1] Generating level 0 area "CutsceneArea" with seed 0'
    expect(parseClientLogLine(line)).toBeNull()
  })

  it('handles multiple-digit levels', () => {
    const line = '[DEBUG Client 1] Generating level 123 area "Foo" with seed 1'
    expect(parseClientLogLine(line)).toEqual({ areaLevel: 123, areaCode: 'Foo' })
  })

  it('handles area codes with underscores and digits', () => {
    const line = '[DEBUG Client 1] Generating level 1 area "1_1_1" with seed 1'
    expect(parseClientLogLine(line)).toEqual({ areaLevel: 1, areaCode: '1_1_1' })
  })
})
