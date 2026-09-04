# Plugin Services

## Architecture

Scalpel plugins can expose unary Protobuf services to declared plugin dependencies and can optionally own one supervised native sidecar.

- `.proto` files are the authoring source of truth.
- Protobuf-ES generates TypeScript message types and typed service descriptors.
- Releases ship self-contained `FileDescriptorSet` artifacts named by `api.contract` or `nativeBackend.contract`.
- Public JavaScript calls pass generated plain message objects through `structuredClone`.
- Native calls encode only the service payload to Protobuf bytes.
- The main process wraps native payloads in a bounded, length-prefixed Protobuf transport envelope.
- The renderer and main process never parse plugin service descriptors at runtime.

API dependencies still use exact `major.minor.patch` matching. Providers activate before consumers, unavailable optional dependencies return `null`, and dependency cycles fail before activation.

At runtime, the generated service name must match the provider manifest, the consumer must declare the provider and exact API version, and every method path must belong to that service. Scalpel does not validate full Protobuf schema equality, so providers must change `api.version` whenever methods or message wire compatibility change; otherwise stale same-version bundles cannot be distinguished. Descriptor sets remain authoring, packaging, and integrity artifacts rather than runtime dispatch inputs, not a sandbox.

## TypeScript APIs

Protobuf-ES service descriptors provide all method and payload type information. Scalpel maps them to typed clients and implementations without a second code generator.

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

Only unary methods are supported. The SDK uses canonical method identities such as `/scalpel.examples.greeting.v1.GreetingProvider/GetLastSeenCharacter` internally; normal plugin code does not contain method strings or result casts.

Public calls remain renderer-local. Access from a plugin's separate overlay renderer is not implemented yet.

## Native Backends

`createNativeServiceClient(ctx.native, Service)` exposes the same generated client shape but encodes requests and decodes responses with Protobuf-ES.

Scalpel owns native process lifecycle and security controls:

- One lazy application-wide process per plugin.
- Executable SHA-256 verification immediately before spawn.
- No shell, renderer-selected path, arguments, or environment.
- One MiB maximum frame size.
- At most 32 in-flight calls.
- Ten-second call timeout.
- Four-MiB bounded standard-input write queue with backpressure.
- Bounded standard-error diagnostics.
- Graceful standard-input close followed by forced termination.
- Workers stop before reload, update, uninstall, application quit, or updater exit. Production package mutations keep the affected worker blocked until restart.

The wire format is a four-byte little-endian frame length followed by a `scalpel.plugin.native.v1.NativeFrame` Protobuf message. Standard output is reserved for frames; diagnostics belong on standard error.

Rust workers can use the `scalpel-plugin-native` crate for framing, initialization, and transport errors. Service messages are generated into Cargo `OUT_DIR` by `prost-build`. The service wire contract is independent of Prost, so a worker may move to a borrowed-view implementation later without changing JavaScript clients or `.proto` files.

Protocol v1 is intentionally a bounded unary control plane. Its fixed frame size, fixed deadline, and sequential first-party Rust dispatcher suit small request/response workloads such as the item-analyzer example. Heavy OCR, image, and dataset workloads require a separate protocol v2 with generic attachments, cancellation, request-targeted progress, bounded concurrency, health supervision, and immutable packaged resources. Those features will not be added by silently changing v1.

## Builder

`@scalpelpoe/plugin-tools` ships the `scalpel-plugin` CLI. Keeping authoring tools separate avoids installing Buf and esbuild for plugins that only need SDK types:

```text
scalpel-plugin generate
scalpel-plugin check
scalpel-plugin build
scalpel-plugin pack
```

Configuration lives in the plugin's `package.json` under `scalpelPlugin`. The CLI runs its pinned Buf and Protobuf-ES tools, emits descriptor sets, checks generated files without modifying them, creates a minified `plugin.js`, discovers Cargo executables from JSON artifact messages, hashes native assets, and assembles `dist`.

Generated TypeScript and descriptor sets are committed. Bundled `plugin.js` files are build outputs and are not committed in the examples. Generated Rust stays exclusively in Cargo `OUT_DIR`.

## Examples

- `plugin-service-examples/greeting-provider` is intentionally headless. It observes English Client.txt death and level-up lines and exposes the last character name seen in one of those events.
- `plugin-service-examples/greeting-relay` consumes the provider, presents a message-entry tab, and exposes a second service that composes `<character> says <message>`. Its manifest demonstrates that one plugin may declare both `api` and `dependencies`.
- `plugin-service-examples/greeting-consumer` presents an output tab and consumes the relay, completing a provider -> relay -> consumer chain.
- `plugin-service-examples/native-item-analyzer` sends Protobuf bytes through the supervised Rust sidecar.

Run `npm run build:plugin-service-examples` for the public examples and `npm run build:native-plugin-example` for a loadable native package.

The greeting provider's character result is explicitly a last-seen heuristic, not authoritative current-character identity. Client.txt may report party members, localized clients use different text, and Scalpel starts following new lines at the end of the file. Until a matching line is observed, the relay and consumer show an unavailable result rather than inventing a name.

Plugins with missing, incompatible, cyclic, or transitively unavailable required dependencies remain installed but are excluded from the runtime graph. Settings shows their reason and keeps repair/removal controls available. Loading the missing provider in Developer mode re-evaluates the graph and activates newly satisfied dependents in provider-first order.

## Deferred

- Streaming RPCs
- JavaScript service calls from secondary overlay renderers
- Progress, cancellation, and unsolicited events
- Large binary attachments and immutable native resources
- Per-call deadlines and concurrent Rust dispatch
- Native-to-plugin calls
- Linux native targets
- Hostile-plugin isolation
- Automatic provider discovery or dependency installation
