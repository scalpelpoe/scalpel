import { exposePluginService, type PluginActivate } from '@scalpelpoe/plugin-sdk'
import { GreetingProvider } from './generated/greeting_pb'

const activate: PluginActivate = (ctx) => {
  let calls = 0
  exposePluginService(ctx.plugins, GreetingProvider, {
    greet(request) {
      calls += 1
      return {
        message: `Hello, ${request.name || 'Exile'}!`,
        calls,
      }
    },
  })

  ctx.registerTab({
    label: 'Greeting Provider',
    icon: '<svg viewBox="0 0 16 16"><path d="M2 3h12v8H8l-3 3v-3H2z" fill="currentColor"/></svg>',
    render(container) {
      container.innerHTML = '<section style="padding:16px"><h2>Greeting Provider</h2><p>Typed API is ready.</p></section>'
    },
  })
}

export default activate
