# @scalpelpoe/plugin-tools

Build and packaging tools for [Scalpel](https://github.com/scalpelpoe/scalpel) plugins. The package provides the `scalpel-plugin` command for generating Protobuf contracts, checking generated files, bundling renderer code, and packaging native artifacts.

## Install

```bash
npm install --save-dev https://github.com/scalpelpoe/scalpel/releases/download/sdk-v0.11.0/scalpelpoe-plugin-tools-0.11.0.tgz
```

Node 22 or newer is required. This RFC preview package is a tarball attached to the `sdk-v0.11.0` GitHub Release; it is not published to npm. Install [`@scalpelpoe/plugin-sdk@0.11.0`](https://www.npmjs.com/package/@scalpelpoe/plugin-sdk/v/0.11.0) separately for plugin types and renderer APIs. Plugins that use generated Protobuf services also need `@bufbuild/protobuf@2.14.0` as a project dependency.

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

For a configured native backend, `pack` runs Cargo release build, finds the named binary through Cargo's JSON artifact output, computes its lowercase SHA-256, and writes that checksum into `dist/manifest.json`. The current `win32-x64` target must be packed on Windows x64.

**Native security notice:** The executable is supplied by the plugin author and currently runs as-is, without a sandbox, with Scalpel's user permissions and any elevation. A generated SHA-256 proves only that later bytes match the packaged artifact; it does not prove that the artifact or its dependencies are safe. Process supervision is a lifecycle control, not malware protection. Authors are responsible for all native source, dependencies, build inputs, DLLs, and artifacts they distribute. This temporary trust model remains in effect until a future native-plugin revision explicitly ships enforced containment.

The CLI externalizes `@scalpelpoe/plugin-sdk`, React, and React DOM because Scalpel provides those renderer modules. Service configuration is documented in [PLUGIN_SERVICES.md](https://github.com/scalpelpoe/scalpel/blob/main/PLUGIN_SERVICES.md). Native support is an **experimental, trusted, unsandboxed RFC1 preview**; [NATIVE_PLUGIN_RFC_1.md](https://github.com/scalpelpoe/scalpel/blob/main/NATIVE_PLUGIN_RFC_1.md) is normative for its protocol, limits, lifecycle, platform support, integrity checks, and non-goals.
