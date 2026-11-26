# @scalpel/platform

Desktop integration for Scalpel's Electron main process. The app reaches the
game window, input, shortcuts, clipboard, pointer and capture only through
`platform()`; adding a desktop is a package change, not an app change. This
package must not import from Scalpel's `src/` or depend on React.

## Layout

```text
packages/platform/src/
  platform.ts                lazy router; one backend per process, exposed as platform()
  select.ts                  OS/desktop detection and backend selection
  boot.ts                    Ozone launch/restart args and Electron defaults
  types.ts                   OS-neutral contracts (Backend, Traits, InputHook, ...)
  overlay-window-backend.ts  electron-overlay-window backend + per-OS helpers
  common/                    OS-neutral mechanisms; never imports linux/ or ms-windows/
  linux/
    linux-settings.ts        Platform settings descriptors, defaults and notices
    settings-rules*.ts       editable defaults + compatibility rules
    common/                  Linux-wide mechanisms; never imports a desktop
    desktops/                desktop adapters, registry and geometry providers
      index.ts               registry: adapters, providers, defaults, game mode, backends
      backend-policy.ts      desktop-specific backend gates (Hyprland version)
      kde-plasma/ niri/ sway/ umbriel/ hyprland/
  ms-windows/                Windows admin check, cursor warp, DIP conversion
```

Imports only flow down this tree. Shared code never names a compositor: it asks
the registry for a `LinuxDesktopAdapter` by id. `linux/common` must not import
`linux/desktops`, and desktop adapters must not import each other. A unit test
(`layering.test.ts`) and `scripts/check-import-aliases.mjs` enforce this in CI.
Files under `linux/desktops` import the shared layers through `@platform/...`
(`@platform/common`, `@platform/linux/common`, `@platform/select`,
`@platform/types`), so the layer a compositor uses is visible without resolving
relative paths.

## Backends

`selectBackend` picks one backend per process; `platform()` resolves it lazily.
Boot-registered native overlay wins over the router, and regular-window mode
wins over both.

| Backend | Used for | Traits | Window tracking | Capture |
| --- | --- | --- | --- | --- |
| `windows` | Windows | | electron-overlay-window | `desktopCapturer` |
| `macos` | macOS | | electron-overlay-window | `desktopCapturer` |
| `x11` | X11 / XWayland | | electron-overlay-window | `desktopCapturer` |
| `layer-shell` | native Wayland (wlr layer-shell) | `compositorFocus` | foreign toplevels + adapter geometry | wlr-screencopy |
| `kwin-layer-shell` | KDE Plasma Wayland | `compositorFocus` | KWin DBus scripting bridge | none |
| `hyprland` | Hyprland ≥ 0.56 | `compositorFocus` | `hyprctl` + event socket | `grim` |
| `window` | regular-window mode | `windowLocal` | electron-overlay-window / Wayland host | Electron |

`compositorFocus` means the compositor owns focus and stacking: hide overlays by
unmapping and hit-test with `trackerPoint()`. `windowLocal` means a normal,
focusable window instead of a click-through overlay; the host app uses it for
layout and input decisions instead of checking backend ids.

KWin has no wlr-foreign-toplevel, screencopy, virtual keyboard or pointer warp.
Its adapter runs a small KWin script over DBus for exact geometry, active-window
state and pointer position, injects keys through `ydotoold`, and reports capture
as unavailable instead of opening an interactive `desktopCapturer` picker.
Starting the overlay does not use a private activation API; hiding it lets KWin
restore the previous toplevel.

## Desktop detection

`select.ts` resolves the desktop from proof, not from names alone:
`XDG_CURRENT_DESKTOP` is frequently unset, generic, or written by a session
manager. Order:

1. Compositor signature variables: `HYPRLAND_INSTANCE_SIGNATURE`,
   `NIRI_SOCKET`, `SWAYSOCK`.
2. Control sockets in `XDG_RUNTIME_DIR`: `niri.wayland-*.sock`,
   `sway-ipc.*.sock`, `hypr/<signature>/.socket.sock`.
3. The Umbriel CLI: `umbriel windows --json` only succeeds against a running
   Umbriel compositor.
4. Session names: `XDG_CURRENT_DESKTOP`, `XDG_SESSION_DESKTOP`,
   `DESKTOP_SESSION`, `KDE_FULL_SESSION`, `KDE_SESSION_VERSION`.
5. Generic `wayland` / `x11` / `unknown`.

Binary existence on `PATH` is deliberately not evidence: a developer machine
commonly has `swaymsg`, `hyprctl`, `niri` and `umbriel` installed at once.
`currentEnv()` resolves the runtime proof once into `PlatformEnv.runtimeDesktop`;
hand-built test envs omit it, so unit tests never probe or spawn a process.

## Platform settings

The Linux settings tab is built entirely inside the package. `linux-settings.ts`
turns saved values plus environment facts into plain descriptors; the renderer
(`PlatformTab.tsx`) only renders them, and `src/main/platform-settings.ts` is the
thin host adapter that maps opaque ids to store keys. Values are shown as
`Auto`/`Detected` with the effective backend, never as translated text in the
package (labels are message keys).

The primary controls are `Scalpel display mode` and `PoE display mode`.
Everything else is in the collapsed **Advanced** section.

| Selector | Values | Auto behaviour | Applies |
| --- | --- | --- | --- |
| Scalpel display mode | `x11`, `wayland` | saved value, default `x11` | restart (Ozone) |
| PoE display mode | `auto`, `detect`, `x11`, `wayland` | `auto` mirrors Scalpel's mode; `detect` uses the live PoE mode | live |
| Desktop environment | `auto`, `kde-plasma`, `hyprland`, `niri`, `sway`, `umbriel` | detected desktop | live |
| Windowing mode | `auto`, `x11`, `window`, `layer-shell` | adapter default (`layer-shell` for the selectable desktops) | restart |
| Input backend | `auto`, `uiohook`, `ydotool`, `wtype`, `compositor` | X11 → uiohook; native Wayland → ydotool/wtype | live |
| Clipboard backend | `auto`, `wl-clipboard`, `compositor`, `native` | data-control → wl-clipboard → Electron | live |
| Shortcut backend | `auto`, `evdev`, `portal`, `electron` | X11 → Electron; native Wayland → desktop default, else evdev/portal | restart |

A selectable desktop's defaults come from its adapter; a selected desktop always
wins over the detected one, and a resolved value never overrides an explicit
choice. On native Wayland, `auto` windowing falls back to a regular window when
layer-shell is unavailable; on X11 it stays X11. Input `compositor` uses the
Wayland host's virtual keyboard and does not silently fall back to uIOhook.
Clipboard `native` is the explicit Electron opt-out.

`PoE display mode` is a warning aid, not a runtime switch: `auto` follows
Scalpel's display mode, while `detect` uses identity-checked live detection
(X11 geometry alone is not trusted on native Wayland).

Notices are rendered under the selector that owns them, with an inline action
where one helps (for example "switch Scalpel to Wayland"). Whole-app state such
as a pending restart uses a banner. The editable matrix lives in
`settings-rules-map.ts`; Auto defaults live on the desktop adapters.

The Advanced section also holds the PoE 1 / PoE 2 window-title overrides:
`Title|appId[,alt]|className|instance`. Plain titles still work; the live
`Current` / `Previous` rows show the last activated titles with a `Copy` button.
Title-only sources (X11 hook, `desktopCapturer`) cannot enforce app-id hints.

Live changes: input, clipboard, desktop and PoE display mode. Windowing mode,
shortcut backend and Scalpel display mode need a relaunch; a real
`--ozone-platform=` flag locks the display selector. Electron defaults and
managed relaunch args are in `boot.ts`.

## Desktop adapters

The registry returns a `LinuxDesktopAdapter`:

- `defaults` — Auto values for the settings tab.
- `geometryProviders()` — exact bounds from compositor IPC.
- `detectGameMode()` — compositor-backed PoE X11/Wayland probe (Hyprland).
- `startFocusTracking()` — focus source for non-layer-shell modes (KWin).
- `layerShell` — probe requirements, tracker, input/feature overrides and focus
  ownership. Absent hooks mean the generic wlr behaviour, so a simple compositor
  only contributes geometry.

KWin is the only adapter with a custom tracker, input path and probe
requirements today. Niri, Sway and Umbriel contribute geometry providers; Niri
also sets `evdev` as its Auto shortcut default, and Hyprland supplies the
game-mode probe.

## Input, shortcuts, clipboard

The default hook is uiohook-napi. On native Wayland the package resolves a Linux
override: external `ydotool`/`wtype`, or the layer-shell host's virtual keyboard
when selected explicitly; a Wayland Ozone process never falls back to uIOhook.
Combos go through `InputHook.injectCombo` so batched injections stay ordered.

Exactly one shortcut backend owns an accelerator: Electron `globalShortcut`,
native/standalone evdev, or the GlobalShortcuts portal. `platformShortcuts` is
the neutral delegate (Electron on non-Linux), resolving the implementation per
call.

Clipboard Auto prefers the compositor's data-control selection, then
`wl-copy`/`wl-paste`, then Electron; X11 keeps Electron. Destructuring
`platform().clipboard` does not lock a backend.

Capture is separate from geometry and price check: layer-shell uses
screencopy, the overlay backends use `desktopCapturer`, and KWin reports no
source rather than opening an interactive picker.

## Coordinates

`gameBounds()`, `screenPoint()` and `warpTo()` use Electron DIP; `targetBounds`,
hook pointer events and `trackerPoint()` use tracker space (physical pixels on
X11/Windows). Frames carry their pixel size and `scale`. Convert coordinates
only inside a backend. When `compositorFocus` is set, restore focus before
warping.

The shared `linux/common/wayland/focus-cache.ts` is fed by zwlr foreign-toplevel
or by a compositor adapter (KWin scripting). `isWaylandGameFocused()` and
`onWaylandGameFocusChange()` are the neutral signals used by the app.

## Development and native builds

Run the dev app on native Wayland with:

```sh
npm run dev -- --ozone-platform=wayland
```

The wrapper (`scripts/dev.mjs` + `packages/platform/scripts/dev-ozone.mjs`)
reads the saved display mode when no explicit flag is given and enables
`SCALPEL_DEBUG_LOG`. Useful boot lines: `platform backends effective=...`,
`layer-shell boot ... effective=layer-shell`, `layer-shell tracker attach ...`.

`npm ci` / `npm install` run `scripts/postinstall.js`: generate the gitignored
i18n runtime, apply the `patch-package` patches, rebuild native modules for
Electron, and on Linux force-rebuild patched uiohook and build
`overlay-wayland-host`.

Layer-shell uses a separate host executable because Electron already links its
own Wayland client. Building it needs `wayland-scanner` plus
`wayland-client`/`wayland-cursor`/`xkbcommon` dev packages. Releases ship it in
`app.asar.unpacked`; if it cannot be built, native Wayland falls back to X11.

Temporary dependency for this branch: `electron-overlay-window` is pinned to a
fork build and `patches/electron-overlay-window+4.1.0.patch` adds the
layer-shell tracker types. Upstreaming that host change is the remaining
external dependency.

## Known limitations

- Windows code is preserved under `ms-windows/` and macOS uses the generic
  overlay backend, but neither was tested on this branch.
- The Hyprland backend under `linux/desktops/hyprland/` is the one from
  `main`, moved without changes; it needs `grim` and has not been revalidated
  on this branch.
- GNOME, COSMIC, XFCE and other non-layer-shell desktops use X11/XWayland or
  regular-window mode; they do not get the native overlay.
- Native layer-shell overlays do not support interactive child popups (native
  `<select>` menus, tooltips).
- KWin has no screencopy capture and no pointer warp, and requires a reachable
  `ydotoold`; it cannot activate a window programmatically.
- Regular-window mode on native Wayland is a normal focusable window, not a
  click-through overlay.

## Verification

```sh
npm run typecheck
npm test
npm run lint   # includes check-import-aliases
npm run build
```

`layering.test.ts` guards the package boundaries; `npm run lint` also enforces
the `@platform/*` alias rules.
