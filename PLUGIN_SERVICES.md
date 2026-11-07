# Plugin Services

Plugin services let plugins call each other. A plugin can **offer** one service, a set of request/response methods, and **use** the services of plugins it lists as dependencies. A plugin can also run its own **native helper**, a Windows x64 executable it calls the same way. Native helpers are an experimental preview.

Plugins that don't need any of this keep working as before; see [Existing plugins keep working](PLUGINS.md#existing-plugins-keep-working). Read [`PLUGINS.md`](PLUGINS.md) first for the basics of writing a plugin.

## How it fits together

- You describe a service once, in a `.proto` file. That file is the source of truth.
- `scalpel-plugin generate` turns it into TypeScript ([Protobuf-ES](https://github.com/bufbuild/protobuf-es)) plus a compiled descriptor file (`.binpb`) that ships next to `plugin.js`.
- The provider calls `exposePluginService`. A consumer calls `createPluginServiceClient` for a required dependency, or `getPluginServiceClient` for an optional one; the latter returns `null` when the provider isn't available. The SDK derives method names and message types from the generated code, so plugin code never writes method strings or casts results.
- Calls between plugins stay inside the renderer and pass message objects. Calls to a native helper are encoded to bytes and relayed to the helper process by Scalpel's main process.
- Scalpel does not read `.binpb` files at runtime. They exist for building, packaging, and the registry's checksums.

## Rules

- Methods are request/response only. Streaming is not supported.
- A dependency names an exact API version (`major.minor.patch`). Bump the provider's `api.version` whenever a method or message changes: Scalpel cannot tell two different contracts with the same version apart.
- The `service` in the provider's manifest must be the generated service's full name, and a consumer can only call that service's methods.
- Providers activate before the plugins that use them.
- If a required dependency is missing, has a different API version, is part of a cycle, or is itself unavailable, the plugin stays installed but inactive, and Settings shows why. An unavailable optional dependency only means its client is `null`.

## Set up

Node 22 or newer is required.

```bash
npm install --save-dev @scalpelpoe/plugin-sdk@0.11.0
npm install --save-dev https://github.com/scalpelpoe/scalpel/releases/download/sdk-v0.11.0/scalpelpoe-plugin-tools-0.11.0.tgz
npm install @bufbuild/protobuf@2.14.0
```

- `@scalpelpoe/plugin-sdk` provides types. Scalpel supplies the real SDK at runtime, and the package's own code only throws if something runs it outside Scalpel.
- The tools tarball provides the `scalpel-plugin` command with pinned versions of Buf, Protobuf-ES, and esbuild.
- `@bufbuild/protobuf` is the runtime the generated code imports, so it is a regular dependency.

## Offer and use a service

```ts
import {
  createPluginServiceClient,
  exposePluginService,
  type PluginActivate,
} from '@scalpelpoe/plugin-sdk'
import { GreetingProvider } from './generated/greeting_pb'

// In the provider plugin:
export const provide: PluginActivate = (ctx) => {
  exposePluginService(ctx.plugins, GreetingProvider, {
    getLastSeenCharacter() {
      return {
        result: {
          case: 'character',
          value: { name: 'ExampleExile' },
        },
      }
    },
  })
}

// In a consumer plugin that lists greeting-provider in its dependencies:
export const consume: PluginActivate = (ctx) => {
  const characters = createPluginServiceClient(ctx.plugins, 'greeting-provider', GreetingProvider)
  void characters.getLastSeenCharacter()
}
```

Under the hood the SDK calls methods by their full path, such as `/scalpel.examples.greeting.v1.GreetingProvider/GetLastSeenCharacter`.

**Overlay windows.** A plugin's pop-out overlay runs in its own renderer, where plugin services are not connected: `exposePluginService` does nothing, optional clients are `null`, and required clients reject every call, so activation still succeeds. Native helper calls work in both places.

**Isolation.** The SDK ties each plugin's native client to that plugin, so a well-behaved plugin can't call another plugin's helper by mistake. Plugins share one renderer, though, so this does not stop a malicious plugin.

## Native backends

A native helper is declared under `nativeBackend` in the manifest and called with a typed client generated from its own `.proto`:

```ts
import { createNativeServiceClient, type PluginActivate } from '@scalpelpoe/plugin-sdk'
import { NativeItemAnalyzer } from './generated/native_item_analyzer_pb'

const activate: PluginActivate = (ctx) => {
  const analyzer = createNativeServiceClient(ctx.native, NativeItemAnalyzer)
  void analyzer.analyzeItem({ name: 'Example' })
}
```

- One helper per plugin, offering one private service, on Windows x64 only.
- Scalpel starts the helper on the first call, not on activation, and reuses that one process. It stops the helper before changing the plugin's files and when Scalpel exits.
- A failed call rejects with a `PluginNativeCallError` whose `code` comes from your helper or from Scalpel (for example `UNAVAILABLE` or `DEADLINE_EXCEEDED`).

> **Native helpers are not sandboxed.** The executable is built and supplied by the plugin author and runs as-is with Scalpel's permissions, including administrator rights when Scalpel is elevated. It can use files, the network, and other processes. Checksums only prove the files are the ones published, not that they are safe. Authors are responsible for what they ship, and users install native plugins at their own risk. See the [security model](NATIVE_PLUGIN_RFC_1.md#security-model).

Rust helpers can use the [`scalpel-plugin-native`](crates/scalpel-plugin-native) crate, which handles the protocol. It is not on crates.io; pin the SDK release tag:

```toml
scalpel-plugin-native = { git = "https://github.com/scalpelpoe/scalpel.git", tag = "sdk-v0.11.0" }
```

The wire protocol, limits, timeouts, and lifecycle are specified in [`NATIVE_PLUGIN_RFC_1.md`](NATIVE_PLUGIN_RFC_1.md). Where this page and the RFC differ, the RFC is correct.

## The `scalpel-plugin` tool

The tool reads its configuration from `scalpelPlugin` in your plugin's `package.json`; the examples below have complete configurations. Pass `--project <dir>` to run it on another directory.

| Command | What it does |
| --- | --- |
| `scalpel-plugin generate` | Writes the descriptor files and TypeScript for your `.proto` files. |
| `scalpel-plugin check` | Fails if generated files or `plugin.js` are out of date. Writes nothing; use it in CI. |
| `scalpel-plugin build` | Runs `generate`, then bundles `plugin.js` as minified browser ESM. |
| `scalpel-plugin pack` | Runs `build`, builds your Cargo helper in release mode, writes its SHA-256 into `dist/manifest.json`, and puts every release file in `dist/`. Packing for `win32-x64` needs a Windows x64 machine. |

`.proto` files are sources; the generated TypeScript, descriptor files, and `plugin.js` are build output. Generated Rust stays in Cargo's `OUT_DIR`. Whether you commit the generated browser files is up to you; `check` keeps committed copies honest.

## Examples

All in [`plugin-service-examples/`](plugin-service-examples). They require Scalpel 1.1.0 or newer.

- `greeting-provider` offers a service.
- `greeting-relay` uses that service and offers its own.
- `greeting-consumer` uses the relay, completing the provider → relay → consumer chain.
- `native-item-analyzer` calls a Rust helper with generated Protobuf messages.

Build the service examples with `npm run build:plugin-service-examples`, and the native one (on Windows x64) with `npm run build:native-plugin-example`.

The greeting provider guesses the current character from the most recent matching line in Client.txt. It is a demonstration, not a reliable identity: party members' lines and localized clients can mislead it, and it knows nothing until a matching line appears.
