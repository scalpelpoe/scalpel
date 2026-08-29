import {
  createPluginServiceClient,
  exposePluginService,
  type PluginActivate,
} from '@scalpelpoe/plugin-sdk'
import {
  CharacterObservationKind,
  CharacterObservationSource,
  GreetingProvider,
} from './generated/provider/greeting_pb'
import { GreetingRelay, GreetingUnavailableReason } from './generated/relay/greeting_relay_pb'

const icon = '<svg viewBox="0 0 16 16"><path d="M2 3h9v6H6l-3 3V9H2zm10 2h2v7h-1v2l-2-2H8v-2h4z" fill="currentColor"/></svg>'

const activate: PluginActivate = (ctx) => {
  const provider = createPluginServiceClient(ctx.plugins, 'greeting-provider', GreetingProvider)
  let latestMessage = ''

  exposePluginService(ctx.plugins, GreetingRelay, {
    async getGreeting() {
      const submittedMessage = latestMessage
      if (!submittedMessage) {
        return {
          result: {
            case: 'unavailable',
            value: {
              reason: GreetingUnavailableReason.NO_MESSAGE,
              message: 'No message has been submitted in Greeting Relay yet.',
            },
          },
        }
      }

      try {
        const response = await provider.getLastSeenCharacter()
        if (response.result.case !== 'character') {
          const details = response.result.case === 'unavailable' ? response.result.value.message : 'No result returned.'
          return {
            result: {
              case: 'unavailable',
              value: {
                reason: GreetingUnavailableReason.CHARACTER_UNAVAILABLE,
                message: `A character is not available. ${details}`,
              },
            },
          }
        }

        const characterName = response.result.value.name
        return {
          result: {
            case: 'greeting',
            value: {
              message: `${characterName} says ${submittedMessage}`,
              characterName,
              submittedMessage,
            },
          },
        }
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error)
        return {
          result: {
            case: 'unavailable',
            value: {
              reason: GreetingUnavailableReason.PROVIDER_ERROR,
              message: `Greeting Provider could not be reached: ${details}`,
            },
          },
        }
      }
    },
  })

  ctx.registerTab({
    label: 'Greeting Relay',
    icon,
    render(container) {
      const section = document.createElement('section')
      section.style.cssText = 'padding:16px;display:grid;gap:12px;max-width:560px'

      const heading = document.createElement('h2')
      heading.textContent = 'Greeting Relay'

      const characterStatus = document.createElement('p')
      characterStatus.textContent = 'Checking Client.txt character status...'

      const form = document.createElement('form')
      form.style.cssText = 'display:grid;gap:8px'

      const label = document.createElement('label')
      label.htmlFor = 'greeting-relay-message'
      label.textContent = 'Message'

      const messageInput = document.createElement('textarea')
      messageInput.id = 'greeting-relay-message'
      messageInput.rows = 4
      messageInput.placeholder = 'Enter the message your character should say'
      messageInput.value = latestMessage

      const submit = document.createElement('button')
      submit.type = 'submit'
      submit.textContent = 'Save message'

      const messageStatus = document.createElement('p')
      messageStatus.textContent = latestMessage ? `Saved message: ${latestMessage}` : 'No message submitted yet.'

      form.append(label, messageInput, submit)
      section.append(heading, characterStatus, form, messageStatus)
      container.replaceChildren(section)

      let active = true
      let refreshSequence = 0

      const refreshCharacter = async (): Promise<void> => {
        const sequence = ++refreshSequence
        characterStatus.textContent = 'Checking Client.txt character status...'
        try {
          const response = await provider.getLastSeenCharacter()
          if (!active || sequence !== refreshSequence) return
          if (response.result.case !== 'character') {
            characterStatus.textContent =
              response.result.case === 'unavailable'
                ? `Character unavailable: ${response.result.value.message}`
                : 'Character unavailable: provider returned no status.'
            return
          }

          const character = response.result.value
          const event = character.kind === CharacterObservationKind.DEATH ? 'death' : `level ${character.level}`
          const source =
            character.source === CharacterObservationSource.LIVE_LOG_LINE ? 'live Client.txt line' : 'recent Client.txt history'
          characterStatus.textContent = `Detected character: ${character.name} (${event}, ${source})`
        } catch (error) {
          if (!active || sequence !== refreshSequence) return
          characterStatus.textContent = `Character status error: ${error instanceof Error ? error.message : String(error)}`
        }
      }

      const saveMessage = (event: SubmitEvent): void => {
        event.preventDefault()
        latestMessage = messageInput.value.trim()
        messageStatus.textContent = latestMessage ? `Saved message: ${latestMessage}` : 'Message cleared.'
        void refreshCharacter()
      }

      form.addEventListener('submit', saveMessage)
      void refreshCharacter()

      return () => {
        active = false
        form.removeEventListener('submit', saveMessage)
      }
    },
  })
}

export default activate
