export type CharacterLogObservation =
  | { kind: 'death'; name: string }
  | { kind: 'level-up'; name: string; characterClass: string; level: number }

const CHARACTER_NAME = '[A-Za-z0-9_]{1,64}'
const CHARACTER_CLASS = '[A-Za-z](?:[A-Za-z ]{0,62}[A-Za-z])?'
const DEATH = new RegExp(`^(${CHARACTER_NAME}) has been slain\\.$`)
const LEVEL_UP = new RegExp(`^(${CHARACTER_NAME}) \\((${CHARACTER_CLASS})\\) is now level ([1-9][0-9]{0,2})$`)

export function parseCharacterLogLine(line: string): CharacterLogObservation | null {
  const separator = '] : '
  const separatorIndex = line.lastIndexOf(separator)
  const message = (separatorIndex === -1 ? line : line.slice(separatorIndex + separator.length)).trim()

  const death = DEATH.exec(message)
  if (death) return { kind: 'death', name: death[1] }

  const levelUp = LEVEL_UP.exec(message)
  if (!levelUp) return null

  const level = Number(levelUp[3])
  if (level > 100) return null
  return {
    kind: 'level-up',
    name: levelUp[1],
    characterClass: levelUp[2],
    level,
  }
}
