# scalpel-plugin-native

Rust helper for the [Scalpel Native Plugin RFC1](../../NATIVE_PLUGIN_RFC_1.md) stdio transport.

**Experimental preview:** RFC1 and this crate can be replaced by a later protocol version. The crate is not published to crates.io. Pin the public revision that contains the current RFC1 implementation:

**Security notice:** This crate provides framing and dispatch, not sandboxing, privilege reduction, malware detection, or safe execution. Scalpel runs the plugin author's executable as-is with its user permissions and any elevation. Authors are responsible for their native code, dependencies, build chain, and release artifacts; users run them at their own risk until a future native-plugin revision explicitly ships enforced containment.

```toml
[dependencies]
prost = "0.14"
scalpel-plugin-native = { git = "https://github.com/scalpelpoe/scalpel.git", rev = "41275dcbc339b8c6af7fcea20325575a49b0ecc6" }
```

## Usage

Generate your service messages separately with `prost-build`, then pass their encoded bytes through the dispatcher:

```rust
use prost::Message;
use scalpel_plugin_native::{BackendError, BackendIdentity, serve_stdio};

const PLUGIN_ID: &str = "my-plugin";
const SERVICE: &str = "example.analysis.v1.Analyzer";
const ANALYZE: &str = "/example.analysis.v1.Analyzer/Analyze";

fn main() -> std::io::Result<()> {
    serve_stdio(
        BackendIdentity {
            plugin_id: PLUGIN_ID,
            service: SERVICE,
        },
        |method, payload| {
            if method != ANALYZE {
                return Err(BackendError::new("METHOD_NOT_FOUND", "unknown method"));
            }
            let request = AnalyzeRequest::decode(payload)
                .map_err(|error| BackendError::new("INVALID_ARGUMENT", error.to_string()))?;
            Ok(analyze(request).encode_to_vec())
        },
    )
}
```

`serve_stdio` validates the initialization identity, enforces the 1 MiB envelope limit, writes transport errors, flushes each response, and exits normally at stdin EOF. Its dispatcher is synchronous and sequential. Write diagnostics to stderr only; stdout is reserved for framed protocol messages.

The complete working example is [`plugin-service-examples/native-item-analyzer`](../../plugin-service-examples/native-item-analyzer). Framing, handshake, response-kind, timeout, concurrency, backpressure, lifecycle, and trust requirements are normative in [`NATIVE_PLUGIN_RFC_1.md`](../../NATIVE_PLUGIN_RFC_1.md).
