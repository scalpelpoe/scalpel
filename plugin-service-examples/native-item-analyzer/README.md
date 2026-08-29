# Native Item Analyzer

This example is an ordinary TypeScript plugin with a private Rust sidecar. Its action hotkey reads a hovered Path of Exile item and calls the generated `NativeItemAnalyzer` Protobuf service.

Bind **Analyze hovered item** under Settings > Macros > Plugin Hotkeys. Hover an item in Path of Exile and press the hotkey: the plugin opens its popup, captures the item privately with `showOverlay: false` and `dispatch: false`, and displays the native result without a second click. The tab's **Analyze hovered item** button runs the same action for mouse access.

The popup runs in a separate renderer, so the action hands status and results to it through a revisioned `ctx.storage` record. The popup reads once when rendered, polls while mounted, and cleans up its timer when torn down.

The `.proto` file is the source of truth for TypeScript and Rust. Protobuf-ES generates the browser message and service descriptors; `prost-build` generates Rust messages into Cargo `OUT_DIR`. The `scalpel-plugin-native` crate owns framing, initialization, and transport errors.

## Build And Load

Requirements: Node 22 and a Rust toolchain with the `x86_64-pc-windows-msvc` host target.

```powershell
npm run build:native-plugin-example
```

Load either `plugin-service-examples/native-item-analyzer` or its `dist` directory through Scalpel's Developer mode. Selecting the project root automatically resolves its immediate `dist` package.

## Protocol

TypeScript encodes the service request to Protobuf bytes. The main process sends a four-byte little-endian frame length followed by a `scalpel.plugin.native.v1.NativeFrame` message. The worker returns the matching request ID with either a Protobuf payload or a structured transport error.

Standard output is reserved for frames. Diagnostics go to standard error. The worker exits when Scalpel closes standard input; Scalpel force-terminates it if graceful shutdown does not complete promptly.
