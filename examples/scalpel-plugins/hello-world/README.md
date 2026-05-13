# scalpel-plugin-hello-world

Reference plugin for Scalpel. Demonstrates the v1 plugin SDK surface:

- **Render a tab** in the overlay (registerTab)
- **React to current items** (onCurrentItem) - shows the most recent hotkey'd item
- **Register a hotkey** (registerHotkey) - "Hello World: Increment counter" appears in Macros settings
- **Persist state** (ctx.storage) - the press counter survives Scalpel restarts

## Build

```
npm install
npm run build
```

Output: `dist/plugin.js` and `dist/manifest.json`.

## Local install for testing

See [../README.md](../README.md). After install, open Settings > Macros to bind a key for "Hello World: Increment counter".
