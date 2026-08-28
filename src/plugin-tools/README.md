# @scalpelpoe/plugin-tools

Build and packaging tools for [Scalpel](https://github.com/scalpelpoe/scalpel) plugins. The package provides the `scalpel-plugin` command for generating Protobuf contracts, checking generated files, bundling renderer code, and packaging native artifacts.

## Install

```bash
npm install --save-dev @scalpelpoe/plugin-tools
```

Node 22 or newer is required. Install [`@scalpelpoe/plugin-sdk`](https://www.npmjs.com/package/@scalpelpoe/plugin-sdk) separately for plugin types and renderer APIs. Plugins that use generated Protobuf services also need `@bufbuild/protobuf` as a project dependency.

## Commands

```bash
npx scalpel-plugin generate
npx scalpel-plugin check
npx scalpel-plugin build
npx scalpel-plugin pack
```

- `generate` writes descriptor sets and Protobuf-ES TypeScript sources configured by `scalpelPlugin.contracts`.
- `check` verifies generated contracts and `plugin.js` are current without writing them.
- `build` generates contracts and writes a minified browser ESM bundle.
- `pack` builds the plugin, packages its manifest and contracts under `dist/`, and includes a configured native executable.

All commands read `scalpelPlugin` from the target project's `package.json`. Use `--project <path>` to target a directory other than the current working directory.

The CLI externalizes `@scalpelpoe/plugin-sdk`, React, and React DOM because Scalpel provides those renderer modules. Service and native-package configuration is documented in [PLUGIN_SERVICES.md](https://github.com/scalpelpoe/scalpel/blob/main/PLUGIN_SERVICES.md).
