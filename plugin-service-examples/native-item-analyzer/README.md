# Native Item Analyzer

This example is an ordinary TypeScript Scalpel plugin with a private Rust sidecar. Its tab opens a secondary overlay; the overlay reads the currently hovered Path of Exile item and calls the Rust `analyzeItem` method through `ctx.native.call()`.

The Rust executable emits `backend.openrpc.json` from its request/result structs. The root build script bundles `plugin.js`, builds Rust in release mode, hashes the executable, and writes a complete loadable package under `dist/`.

## Build And Load

Requirements: Node 22, the repository npm dependencies, and a Rust toolchain with the `x86_64-pc-windows-msvc` host target.

```powershell
npm run build:native-plugin-example
```

In Scalpel, enable Developer mode, choose **Load unpacked plugin**, and select `plugin-service-examples/native-item-analyzer/dist`.

Open the **Native Item Analyzer** tab, open its pop-out, hover an item in Path of Exile, and click **Analyze hovered item**.

## Protocol

Scalpel starts one process for this plugin on its first native call. It sends one UTF-8 JSON object per line:

```json
{"id":1,"method":"scalpel.initialize","params":{"protocolVersion":1,"pluginId":"native-item-analyzer"}}
{"id":2,"method":"analyzeItem","params":{"name":"Doom Bite","baseType":"Vaal Axe","rarity":"Rare","itemLevel":86,"implicits":[],"explicits":[]}}
```

The worker responds with the same request ID and either `result` or `error`. Standard output is reserved for these protocol frames; diagnostics go to standard error.

The worker exits when Scalpel closes its standard input. Scalpel force-terminates it if graceful shutdown does not complete promptly.
