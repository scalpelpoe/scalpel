# Plugin Services

Scalpel plugins can expose one public unary Protobuf service to declared plugin dependencies and can optionally own one supervised native sidecar. This is the practical overview for authors.

**Native RFC1 is an experimental preview.** [`NATIVE_PLUGIN_RFC_1.md`](NATIVE_PLUGIN_RFC_1.md) is the normative reference for native framing, handshake, method paths, limits, response rules, lifecycle, platform support, packaging integrity, security, and non-goals. If this overview and the RFC differ, follow the RFC.

## Architecture

- `.proto` files are the authoring source of truth.
- Protobuf-ES generates TypeScript messages and typed service descriptors.
- Releases include root-level binary `FileDescriptorSet` files named by `api.contract` or `nativeBackend.contract`.
- Public plugin-to-plugin calls pass generated message objects through renderer-local structured cloning.
- Native calls encode the method input to Protobuf bytes. The main process carries those bytes in RFC1's bounded stdio envelope.
- Descriptor sets are generation, packaging, and integrity artifacts. The renderer and main process do not parse them for runtime dispatch or validate full schema equality.

Only unary methods are supported. Public API dependencies use exact `major.minor.patch` matching. Providers activate before consumers, unavailable optional dependencies return `null`, and missing, incompatible, cyclic, or transitively unavailable required dependencies keep a plugin out of the runtime graph.

## Install The Preview Toolchain

Node 22 or newer is required.

```bash
npm install --save-dev @scalpelpoe/plugin-sdk@0.11.0
npm install --save-dev https://github.com/scalpelpoe/scalpel/releases/download/sdk-v0.11.0/scalpelpoe-plugin-tools-0.11.0.tgz
npm install @bufbuild/protobuf@2.14.0
```

The SDK runtime is supplied by Scalpel; the npm package provides declarations and a protective out-of-host stub. The tools tarball provides the Node-only `scalpel-plugin` CLI and its pinned Buf, Protobuf-ES, and esbuild dependencies.

## TypeScript APIs

Generated Protobuf-ES descriptors provide the method and payload types:

```ts
import {
  createPluginServiceClient,
  exposePluginService,
  type PluginActivate,
} from '@scalpelpoe/plugin-sdk'
import { GreetingProvider } from './generated/greeting_pb'

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

export const consume: PluginActivate = (ctx) => {
  const characters = createPluginServiceClient(ctx.plugins, 'greeting-provider', GreetingProvider)
  void characters.getLastSeenCharacter()
}
```

`getPluginServiceClient` is the nullable form for an optional dependency. The SDK constructs canonical paths such as `/scalpel.examples.greeting.v1.GreetingProvider/GetLastSeenCharacter`; normal plugin code does not write method strings or cast results.

The generated service name must match the provider manifest. A consumer must declare the provider and exact API version, and method paths must belong to that service. Providers must bump `api.version` whenever methods or message wire compatibility change because Scalpel cannot distinguish incompatible same-version descriptor bundles.

Public service calls are renderer-local and are not available from a plugin's separate overlay renderer. Native clients are owner-only but are available in both renderer contexts.

## Native Backends

Create a typed client from the generated native service:

```ts
import { createNativeServiceClient, type PluginActivate } from '@scalpelpoe/plugin-sdk'
import { NativeItemAnalyzer } from './generated/native_item_analyzer_pb'

const activate: PluginActivate = (ctx) => {
  const analyzer = createNativeServiceClient(ctx.native, NativeItemAnalyzer)
  void analyzer.analyzeItem({ name: 'Example' })
}
```

RFC1 supports one private service and one lazy process per plugin on Windows x64. The backend is a trusted, unsandboxed executable running with Scalpel's user permissions. Checksums and owner routing do not restrict its filesystem, network, process, or system access. Read the [normative RFC](NATIVE_PLUGIN_RFC_1.md) before shipping a native plugin.

Rust workers can use the unpublished [`scalpel-plugin-native`](crates/scalpel-plugin-native) helper. Pin the RFC1 implementation rather than a branch:

```toml
scalpel-plugin-native = { git = "https://github.com/scalpelpoe/scalpel.git", rev = "41275dcbc339b8c6af7fcea20325575a49b0ecc6" }
```

## Builder

Configuration lives under `scalpelPlugin` in the plugin's `package.json`. See the checked-in examples for complete configurations.

```text
scalpel-plugin generate
scalpel-plugin check
scalpel-plugin build
scalpel-plugin pack
```

- `generate` writes configured descriptor sets and Protobuf-ES TypeScript sources.
- `check` regenerates in temporary storage and fails if descriptors, generated TypeScript, or the configured `plugin.js` are stale.
- `build` generates contracts and creates the minified browser ESM `plugin.js`.
- `pack` also builds the configured Cargo binary in release mode, takes the executable path from Cargo JSON artifact output, writes its SHA-256 into `dist/manifest.json`, and assembles root-level release files under `dist/`. Packing `win32-x64` requires a Windows x64 host.

The CLI treats `.proto` files as sources and generated TypeScript, descriptor sets, and `plugin.js` as generated artifacts. Generated Rust remains exclusively in Cargo `OUT_DIR`. Choose whether to commit browser-side generated artifacts consistently for your repository; `check` can enforce that committed copies are current.

## Examples

- `plugin-service-examples/greeting-provider` exposes a public service.
- `plugin-service-examples/greeting-relay` consumes that service and exposes another.
- `plugin-service-examples/greeting-consumer` completes the provider-to-relay-to-consumer chain.
- `plugin-service-examples/native-item-analyzer` sends generated Protobuf payloads through the supervised Rust sidecar.

Run `npm run build:plugin-service-examples` for the public service examples and `npm run build:native-plugin-example` on Windows x64 for a loadable native package.

The greeting provider's character result is a last-seen Client.txt heuristic, not authoritative current-character identity. Localized clients and party lines can differ, and no result is available until a matching newly followed line appears.
