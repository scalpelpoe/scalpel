import { describe, expect, it } from 'vitest'
import { parseCharacterLogLine } from './character-log'

describe('parseCharacterLogLine', () => {
  it('parses death and level-up lines with or without Client.txt metadata', () => {
    expect(parseCharacterLogLine('Ranger_One has been slain.')).toEqual({
      kind: 'death',
      name: 'Ranger_One',
    })
    expect(
      parseCharacterLogLine('2026/08/28 12:00:00 123456 abc [INFO Client 1234] : MapRunner (Deadeye) is now level 97'),
    ).toEqual({
      kind: 'level-up',
      name: 'MapRunner',
      characterClass: 'Deadeye',
      level: 97,
    })
  })

  it('rejects lookalikes and unsafe candidates', () => {
    expect(parseCharacterLogLine('Some Player has been slain.')).toBeNull()
    expect(parseCharacterLogLine('@From Friend: MapRunner has been slain.')).toBeNull()
    expect(parseCharacterLogLine('MapRunner (Deadeye) is now level 101')).toBeNull()
    expect(parseCharacterLogLine('MapRunner (Deadeye) est maintenant niveau 97')).toBeNull()
  })
})
