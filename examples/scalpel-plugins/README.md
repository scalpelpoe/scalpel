# Scalpel plugin examples

Local development and reference examples for the Scalpel plugin API.

## Building

Each example is its own npm project. Inside one:

```
npm install
npm run build
```

The build produces `dist/plugin.js` and copies `manifest.json` into `dist/`.

## Loading into Scalpel for testing

Find your Scalpel `userData` directory:

- Windows: `%APPDATA%\filterscalpel`
- macOS: `~/Library/Application Support/filterscalpel`
- Linux: `~/.config/filterscalpel`

Then:

1. Create `userData/plugins/hello-world/` (the directory name must match the manifest `id`).
2. Copy `dist/plugin.js` and `dist/manifest.json` (and any icon) into it.
3. Edit `userData/plugins/installed.json` to be `["hello-world"]` (creating the file if it doesn't exist).
4. Restart Scalpel.

The plugin's tab should appear in the title bar.
