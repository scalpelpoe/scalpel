import { describe, expect, it } from 'vitest'
import { parseLastZoneFromChunk, readLastZoneFromLog, type SeedLastZoneFs } from './seed-last-zone'

describe('parseLastZoneFromChunk', () => {
  it('returns the last Generating-level line', () => {
    const text = [
      'noise',
      '[DEBUG Client 1] Generating level 5 area "G1_1" with seed 1',
      'chat',
      '[DEBUG Client 1] Generating level 6 area "G1_2" with seed 2',
      'more noise',
    ].join('\n')
    expect(parseLastZoneFromChunk(text)).toEqual({ areaLevel: 6, areaCode: 'G1_2' })
  })

  it('skips level 0 cutscenes', () => {
    const text = [
      '[DEBUG Client 1] Generating level 5 area "G1_1" with seed 1',
      '[DEBUG Client 1] Generating level 0 area "Cutscene" with seed 0',
    ].join('\n')
    expect(parseLastZoneFromChunk(text)).toEqual({ areaLevel: 5, areaCode: 'G1_1' })
  })

  it('returns null when no zone line is present', () => {
    expect(parseLastZoneFromChunk('hello\nworld')).toBeNull()
  })

  it('does not seed across a session boundary', () => {
    const text = [
      '[DEBUG Client 1] Generating level 70 area "OldMap" with seed 1',
      '***** LOG FILE OPENING *****',
      'login noise',
    ].join('\n')
    expect(parseLastZoneFromChunk(text)).toBeNull()
  })

  it('seeds from a zone line after the last session boundary', () => {
    const text = [
      '[DEBUG Client 1] Generating level 70 area "OldMap" with seed 1',
      '***** LOG FILE OPENING *****',
      '[DEBUG Client 1] Generating level 12 area "G2_town" with seed 2',
    ].join('\n')
    expect(parseLastZoneFromChunk(text)).toEqual({ areaLevel: 12, areaCode: 'G2_town' })
  })
})

describe('readLastZoneFromLog', () => {
  it('reads the file tail and parses the last zone', () => {
    const body = Buffer.from('[DEBUG Client 1] Generating level 12 area "G2_town" with seed 9\n')
    const fs: SeedLastZoneFs = {
      statSync: () => ({ size: body.length }),
      openSync: () => 7,
      readSync: (_fd, buffer) => {
        body.copy(buffer)
        return body.length
      },
      closeSync: () => undefined,
    }
    expect(readLastZoneFromLog('/fake/Client.txt', fs)).toEqual({ areaLevel: 12, areaCode: 'G2_town' })
  })
})
