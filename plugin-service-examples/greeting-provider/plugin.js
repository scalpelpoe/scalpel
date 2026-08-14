export default function activate(ctx) {
  let calls = 0

  ctx.plugins.expose((method, params) => {
    if (method !== 'greet') throw new Error(`Unknown method: ${method}`)
    calls += 1
    const name = typeof params?.name === 'string' ? params.name : 'Exile'
    return { message: `Hello, ${name}!`, calls }
  })

  ctx.registerTab({
    label: 'Greeting Provider',
    icon: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="currentColor"/></svg>',
    render(container) {
      container.innerHTML = `
        <section style="padding: 16px">
          <h2>Greeting Provider</h2>
          <p>This plugin exposes <code>greet</code> and still renders normal UI.</p>
          <p data-call-count>Calls served: ${calls}</p>
        </section>
      `
    },
  })
}
