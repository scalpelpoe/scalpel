# Plugin Service Examples

## Public Service Chain

The greeting examples form a three-plugin dependency graph:

```text
greeting-provider -> greeting-relay -> greeting-consumer
```

- `greeting-provider` is intentionally headless. It watches recent and live Client.txt lines for English `<character> has been slain.` and `<character> (<class>) is now level <level>` events, then exposes the last character seen.
- `greeting-relay` consumes that service, provides a message-entry tab, and exposes its own composed greeting service. It demonstrates a single manifest with both `api` and `dependencies`.
- `greeting-consumer` consumes the relay and provides the final output tab.

The detected character is a demonstration heuristic. Death and level-up lines can refer to party members, localized clients use different text, and no result is available until Scalpel observes a matching line.

Build the chain:

```powershell
npm run build:plugin-service-examples
```

In Settings > Developer, load the directories in provider, relay, consumer order. Loading them in another order is also safe: dangling plugins remain installed but disabled until their required providers become available.

## Native Service

`native-item-analyzer` demonstrates a private Rust sidecar in one plugin package. See its README for build and hotkey instructions.
