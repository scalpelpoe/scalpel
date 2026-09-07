# Scalpel Native Plugin RFC1

Status: experimental preview

RFC1 lets a Scalpel plugin package own one private unary Protobuf service implemented by a supervised native process. It is intended for early author feedback and trusted testing. The protocol and APIs may change before native plugin support is declared stable.

This document is normative for RFC1. [`PLUGIN_SERVICES.md`](PLUGIN_SERVICES.md) is the shorter authoring overview.

## Security Model

A native backend is trusted, unsandboxed executable code. It runs with the same user permissions as Scalpel and can access files, the network, processes, and other operating-system resources. The host's checksum verification, owner-only routing, process supervision, and curated registry do not make hostile native code safe.

Only install native plugins whose source and release artifacts you trust.

## Supported Shape

RFC1 supports:

- Windows x64 (`win32-x64`)
- one native executable per plugin
- one private Protobuf service per executable
- unary request/response methods
- lazy process startup on the first call
- multiple correlated in-flight calls at the transport layer

RFC1 does not promise concurrent execution inside a worker. The current Rust helper dispatches calls synchronously and sequentially.

## Manifest

The plugin's root-level `manifest.json` declares the backend:

```json
{
  "nativeBackend": {
    "protocolVersion": 1,
    "contract": "backend.binpb",
    "service": "example.analysis.v1.Analyzer",
    "targets": {
      "win32-x64": {
        "file": "my-plugin-backend.exe",
        "sha256": "<64 lowercase hexadecimal characters>"
      }
    }
  }
}
```

The contract and executable filenames must be safe, unique, root-level package filenames. `contract` is a binary Protobuf `FileDescriptorSet`. `service` is the fully qualified service name generated from that contract. `protocolVersion` must be `1`.

The executable SHA-256 in `manifest.json` must match the packaged bytes. For registry installs, the curated registry must also pin the contract and executable hashes in its `assets` map. Scalpel verifies downloaded assets during installation and verifies the installed executable again before every process spawn.

The descriptor set is a generation, packaging, and review artifact. RFC1 does not parse it at runtime to negotiate or prove schema compatibility.

## Owner Routing

Only the renderer context belonging to a plugin can call that plugin's backend. Plugin code receives no executable path, command-line argument, environment override, working-directory control, or API for calling another plugin's native backend.

Use the typed SDK client rather than the raw byte API:

```ts
import { createNativeServiceClient, type PluginActivate } from '@scalpelpoe/plugin-sdk'
import { Analyzer } from './generated/analyzer_pb'

const activate: PluginActivate = (ctx) => {
  const analyzer = createNativeServiceClient(ctx.native, Analyzer)
  void analyzer.analyze({ text: 'example' })
}

export default activate
```

The SDK derives canonical method paths and encodes/decodes the generated Protobuf message types. A canonical path has this form:

```text
/example.analysis.v1.Analyzer/Analyze
```

The service component must exactly match `nativeBackend.service`. Method and service identifiers use Protobuf identifier characters. Streaming methods are rejected by the authoring tools and SDK.

## Process Contract

Scalpel starts the installed executable with:

- no command-line arguments
- a hidden window
- piped stdin, stdout, and stderr
- shell execution disabled

stdin and stdout are reserved for RFC1 frames. A worker may write bounded diagnostics to stderr, but must never write logs or other unframed bytes to stdout.

The host starts one process lazily for a plugin and reuses it for later calls. No process starts merely because the plugin activates.

## Framing

Every message on stdin and stdout is:

1. a four-byte unsigned little-endian payload length
2. exactly that many bytes containing an encoded `scalpel.plugin.native.v1.NativeFrame`

The encoded `NativeFrame` payload length must be between 1 byte and 1 MiB inclusive. The four-byte prefix is not included in that limit. Zero-length, oversized, truncated, or malformed frames are protocol failures.

The canonical transport schema is [`transport.proto`](crates/scalpel-plugin-native/proto/scalpel/plugin/native/v1/transport.proto).

## Handshake

The first host frame is an `InitializeRequest` with request ID `0`:

```text
protocol_version = 1
plugin_id        = owning manifest id
service          = nativeBackend.service
```

Before accepting calls, the worker must return an `InitializeResponse` with request ID `0` and exactly the same protocol version, plugin ID, and service. Any other response body or identity is a protocol failure.

The Rust `serve_stdio` helper validates the request. On a mismatch it writes a `CallError` with code `PROTOCOL_MISMATCH` and exits. Because RFC1 requires an `InitializeResponse` for request ID `0`, the host treats that error response as a failed handshake.

## Calls And Responses

After initialization, the host sends `CallRequest` bodies with nonzero request IDs. Each contains:

- `method`: the canonical fully qualified method path
- `payload`: the encoded Protobuf input message

The worker must return exactly one frame with the same request ID:

- `CallResponse` containing the encoded output message, or
- `CallError` containing an application-defined code and a human-readable message

`CallError` rejects only that call and does not terminate a healthy worker. Empty codes are allowed by the wire schema, though stable machine-readable codes are recommended.

Response kinds are correlated with request kinds. An initialize request accepts only `InitializeResponse`; a call accepts only `CallResponse` or `CallError`. A valid body of the wrong kind is still a protocol failure.

Unknown request IDs, duplicate responses, malformed Protobuf, invalid frame lengths, response-kind mismatches, and invalid handshakes terminate the worker and reject pending calls.

## Fixed Host Limits

RFC1 host limits are:

| Limit | Value | Behavior |
| --- | ---: | --- |
| Encoded frame payload | 1 MiB | Reject or terminate on an oversized frame |
| In-flight requests per process | 32 | Reject an additional call |
| Call and handshake timeout | 10 seconds | Reject the request and terminate the worker |
| Queued framed stdin while backpressured | 4 MiB | Reject the call that would exceed the queue |
| Retained stderr diagnostics | last 8 KiB | Append to an unexpected-exit error |
| Restart cooldown after failure | 5 seconds | Reject calls instead of immediately respawning |

The in-flight count includes the initialization request while startup is pending. The queue limit includes each queued frame's four-byte length prefix.

## Failure And Lifecycle

Process errors and stdin, stdout, or stderr stream errors terminate the backend and reject all pending calls. An unexpected exit includes the retained stderr tail in its error when available. After an abnormal failure or synchronous spawn failure, that plugin enters the five-second restart cooldown.

Intentional stop uses a bounded, confirmed sequence:

1. close stdin and wait up to 750 ms for process exit or close
2. send `SIGTERM` and wait up to 750 ms
3. send `SIGKILL` and wait up to 750 ms
4. report stop failure if no exit or close event confirms termination

File replacement does not proceed when a worker's termination cannot be confirmed.

Development reload/uninstall temporarily blocks new calls while stopping the worker and changing files. Production registry install, update, or removal stops the affected worker before mutation; after a successful mutation, that plugin remains blocked for the rest of the process and Scalpel requests a full restart. A failed mutation restores normal spawning. Loadability queries exclude packages both while mutation is in progress and while restart is required.

Application shutdown blocks all new native calls before stopping workers. Emergency process teardown sends forced termination without waiting for confirmation.

## Packaging

Install the preview tools and SDK with Node 22 or newer:

```bash
npm install --save-dev @scalpelpoe/plugin-sdk@0.11.0
npm install --save-dev https://github.com/scalpelpoe/scalpel/releases/download/sdk-v0.11.0/scalpelpoe-plugin-tools-0.11.0.tgz
npm install @bufbuild/protobuf@2.14.0
```

`scalpel-plugin pack` builds the JavaScript bundle, generates configured descriptors and TypeScript sources, runs the configured Cargo release build, discovers the named binary from Cargo JSON output, computes its SHA-256, and writes a complete package under `dist/`. A `win32-x64` package must be packed on Windows x64.

Attach every file under `dist/` as a loose root-level GitHub Release asset. Do not publish a manifest template containing a checksum placeholder.

The Rust helper is not published to crates.io. Pin the public RFC1 implementation:

```toml
[dependencies]
prost = "0.14"
scalpel-plugin-native = { git = "https://github.com/scalpelpoe/scalpel.git", rev = "41275dcbc339b8c6af7fcea20325575a49b0ecc6" }
```

See [`crates/scalpel-plugin-native/README.md`](crates/scalpel-plugin-native/README.md) and [`plugin-service-examples/native-item-analyzer`](plugin-service-examples/native-item-analyzer).

## RFC1 Non-Goals

RFC1 does not define:

- sandboxing, capability permissions, or operating-system isolation
- code signing or publisher identity
- streaming RPC
- multiple native services or executables per plugin
- cross-plugin access to native backends
- schema negotiation or dynamic reflection
- Linux, macOS, Windows ARM64, or 32-bit targets
- automatic worker concurrency
- a stable compatibility promise for later native protocol versions

These omissions are deliberate preview boundaries, not implied security or compatibility guarantees.
