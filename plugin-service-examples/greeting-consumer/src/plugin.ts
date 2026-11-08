import { createPluginServiceClient, type PluginActivate } from '@scalpelpoe/plugin-sdk'
import { GreetingRelay } from './generated/greeting_relay_pb'

const activate: PluginActivate = (ctx) => {
  const relay = createPluginServiceClient(ctx.plugins, 'greeting-relay', GreetingRelay)

  ctx.registerTab({
    label: 'Greeting Consumer',
    icon: '<svg viewBox="0 0 16 16"><path d="M2 3h12v8H8l-3 3v-3H2z" fill="currentColor"/></svg>',
    render(container) {
      const section = document.createElement('section')
      section.style.cssText = 'padding:16px;display:grid;gap:12px;max-width:560px'

      const heading = document.createElement('h2')
      heading.textContent = 'Greeting Consumer'

      const result = document.createElement('p')
      result.textContent = 'Loading greeting...'

      const refresh = document.createElement('button')
      refresh.type = 'button'
      refresh.textContent = 'Refresh greeting'

      section.append(heading, result, refresh)
      container.replaceChildren(section)

      let active = true
      let requestSequence = 0
      const loadGreeting = async (): Promise<void> => {
        const sequence = ++requestSequence
        result.textContent = 'Loading greeting...'
        try {
          const response = await relay.getGreeting()
          if (!active || sequence !== requestSequence) return
          if (response.result.case === 'greeting') {
            result.textContent = response.result.value.message
          } else if (response.result.case === 'unavailable') {
            result.textContent = response.result.value.message
          } else {
            result.textContent = 'Greeting Relay returned no greeting status.'
          }
        } catch (error) {
          if (!active || sequence !== requestSequence) return
          result.textContent = error instanceof Error ? error.message : String(error)
        }
      }

      refresh.addEventListener('click', loadGreeting)
      void loadGreeting()

      return () => {
        active = false
        refresh.removeEventListener('click', loadGreeting)
      }
    },
  })
}

export default activate
