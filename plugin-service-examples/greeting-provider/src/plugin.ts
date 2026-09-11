import { exposePluginService, type PluginActivate } from '@scalpelpoe/plugin-sdk'
import { parseCharacterLogLine } from './character-log'
import {
  CharacterObservationKind,
  CharacterObservationSource,
  CharacterUnavailableReason,
  GreetingProvider,
  type LastSeenCharacter,
} from './generated/greeting_pb'

const activate: PluginActivate = (ctx) => {
  let active = true
  let initialized = false
  let lastSeen: LastSeenCharacter | null = null
  let queuedLiveLines: string[] = []

  const observe = (line: string, source: CharacterObservationSource): void => {
    const observation = parseCharacterLogLine(line)
    if (!observation) return
    lastSeen = {
      $typeName: 'scalpel.examples.greeting.v1.LastSeenCharacter',
      name: observation.name,
      source,
      kind:
        observation.kind === 'death' ? CharacterObservationKind.DEATH : CharacterObservationKind.LEVEL_UP,
      characterClass: observation.kind === 'level-up' ? observation.characterClass : '',
      level: observation.kind === 'level-up' ? observation.level : 0,
    }
  }

  const finishSnapshot = (lines: string[]): void => {
    if (!active) return
    for (const line of lines) observe(line, CharacterObservationSource.RECENT_LOG_LINES)
    initialized = true
    const liveLines = queuedLiveLines
    queuedLiveLines = []
    for (const line of liveLines) observe(line, CharacterObservationSource.LIVE_LOG_LINE)
  }

  const unsubscribe = ctx.onLogLine((line) => {
    if (!initialized) {
      queuedLiveLines.push(line)
      return
    }
    observe(line, CharacterObservationSource.LIVE_LOG_LINE)
  })

  void ctx.getRecentLogLines().then(finishSnapshot, () => finishSnapshot([]))

  exposePluginService(ctx.plugins, GreetingProvider, {
    getLastSeenCharacter() {
      if (lastSeen) {
        return { result: { case: 'character', value: lastSeen } }
      }
      if (!initialized) {
        return {
          result: {
            case: 'unavailable',
            value: {
              reason: CharacterUnavailableReason.INITIALIZING,
              message: 'Character history is still loading.',
            },
          },
        }
      }
      return {
        result: {
          case: 'unavailable',
          value: {
            reason: CharacterUnavailableReason.NO_MATCHING_LOG_LINE,
            message: 'No English character death or level-up line was found in recent Client.txt history.',
          },
        },
      }
    },
  })

  return () => {
    active = false
    queuedLiveLines = []
    unsubscribe()
  }
}

export default activate
