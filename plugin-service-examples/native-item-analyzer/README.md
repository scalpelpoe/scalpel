# Native Item Analyzer

This example is an ordinary TypeScript plugin with a private Rust sidecar. The overlay reads a hovered Path of Exile item and calls the generated `NativeItemAnalyzer` Protobuf service.

The `.proto` file is the source of truth for TypeScript and Rust. Protobuf-ES generates the browser message and service descriptors; `prost-build` generates Rust messages into Cargo `OUT_DIR`. The `scalpel-plugin-native` crate owns framing, initialization, and transport errors.

## Build And Load

Requirements: Node 22 and a Rust toolchain with the `x86_64-pc-windows-msvc` host target.

```powershell
npm run build:native-plugin-example
```

Load `plugin-service-examples/native-item-analyzer/dist` through Scalpel's Developer mode.

## Protocol

TypeScript encodes the service request to Protobuf bytes. The main process sends a four-byte little-endian frame length followed by a `scalpel.plugin.native.v1.NativeFrame` message. The worker returns the matching request ID with either a Protobuf payload or a structured transport error.

Standard output is reserved for frames. Diagnostics go to standard error. The worker exits when Scalpel closes standard input; Scalpel force-terminates it if graceful shutdown does not complete promptly.
