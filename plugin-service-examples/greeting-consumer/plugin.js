export default function activate(ctx) {
  const greetings = ctx.plugins.get('greeting-provider')

  ctx.registerTab({
    label: 'Greeting Consumer',
    icon: '<svg viewBox="0 0 16 16"><path d="M2 3h12v8H8l-3 3v-3H2z" fill="currentColor"/></svg>',
    render(container) {
      container.innerHTML = `
        <section style="padding: 16px">
          <h2>Greeting Consumer</h2>
          <button type="button" data-ask-provider>Ask provider</button>
          <p data-provider-result>Waiting for a call.</p>
        </section>
      `
      const button = container.querySelector('[data-ask-provider]')
      const result = container.querySelector('[data-provider-result]')
      const ask = async () => {
        result.textContent = 'Calling...'
        try {
          const response = await greetings.call('greet', { name: 'Exile' })
          result.textContent = `${response.message} (${response.calls} call)`
        } catch (error) {
          result.textContent = error instanceof Error ? error.message : String(error)
        }
      }
      button.addEventListener('click', ask)
      return () => button.removeEventListener('click', ask)
    },
  })
}
