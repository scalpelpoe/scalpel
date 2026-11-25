# @scalpel/platform

Desktop integration for Scalpel's Electron main process. The app reaches the
game window, global input and shortcuts, the clipboard, the pointer and screen
capture only through `platform()`, so a new desktop needs a new backend here
and no app changes.

This package must not import from Scalpel's `src/`.

## Backends

`selectBackend` picks one backend per process; `platform()` resolves it on the
first call through any member, not when the facade is imported.

| Backend | Window tracking | Capture | Cursor warp |
| --- | --- | --- | --- |
| `windows` | electron-overlay-window | Electron `desktopCapturer` | `SetCursorPos` |
| `macos` | electron-overlay-window | Electron `desktopCapturer` | none |
| `x11` | electron-overlay-window, overlays linked with `WM_TRANSIENT_FOR` | Electron `desktopCapturer` | none |
| `hyprland` | `hyprctl` IPC and the event socket | `grim` | compositor dispatch |
| `layer-shell` | electron-overlay-window's Wayland host (foreign-toplevel) | wlr-screencopy, else the screen-cast portal | virtual pointer |

`layer-shell` is selected for a native Wayland client (`--ozone-platform=wayland`).
Overlays render offscreen into wlr-layer-shell surfaces and nothing goes
through XWayland. Game bounds are the logical bounds of the game's output, so
the game must be fullscreen or borderless fullscreen. If the host cannot start,
the process falls back to `x11`.

Hyprland is selected inside a Hyprland session under XWayland from 0.56 on and
needs `grim` on PATH. Other compositors under XWayland keep the X11 tracker.

## Startup

`relaunchArgs` tells the app, before any window exists, whether to relaunch
Electron on another Ozone platform. A Wayland session relaunches as a native
Wayland client where `layerShellSupported()` finds wlr-layer-shell v4,
wlr-foreign-toplevel, and a virtual keyboard or a writable `/dev/uinput`
(wlroots compositors such as Hyprland, niri and Sway; not GNOME, which lacks
layer-shell, nor KWin, which lacks foreign-toplevel), and under XWayland
elsewhere. Passing `--ozone-platform` skips the relaunch.

## Input

The XWayland, Windows and macOS backends use uiohook-napi for global key and
mouse hooks and for key injection. `layer-shell` reads keys, buttons and the
wheel from evdev while the game has focus (the user needs read access to
`/dev/input`, usually the `input` group) and types with a Wayland virtual
keyboard, or with a uinput keyboard where the compositor has none (this needs
write access to `/dev/uinput`, and a modifier the user holds cannot be released
for the game). Its pointer positions are the last known position, refreshed by
`cursor.refresh()` and by modified wheel events. Key codes are `Key` values (PC
scancodes). A hook that only sees physical devices reports
`seesInjectedKeys: false` and answers `physicallyHeld()`, so the app can track
held modifiers while it injects keys.

## Shortcuts and clipboard

Backends use Electron's `globalShortcut` and `clipboard` unless they supply
their own. Under `layer-shell` Electron has neither global shortcuts nor the
clipboard while the game has focus, so shortcuts match evdev presses and keys
typed into overlays (the game also receives the key), and text goes through the
host's data-control connection. Items copied in a game running under XWayland
may not reach data-control (seen with xwayland-satellite).

## Coordinates

- `windowTracker.gameBounds()`, `cursor.screenPoint()` and `cursor.warpTo()`
  use Electron DIP.
- `windowTracker.targetBounds`, input hook pointer events and
  `cursor.trackerPoint()` use the tracker's space, which is physical pixels on
  Windows and X11 and DIP under `layer-shell`.
- Capture frames carry their pixel size and `scale` (frame px per DIP).

Electron's rectangle conversion is Windows-only, and XWayland coordinates need
not equal compositor or physical pixels, so convert only inside a backend.

## Traits

`traits.compositorFocus` is set when the compositor, not the overlay window
library, owns overlay focus and stacking. The app then hides overlays by
unmapping them, routes focus through `windowTracker.focusOverlay()`, and hit
tests with `cursor.trackerPoint()`. Keep focus restoration before cursor
warping: Hyprland rejects item-targeting warps unless the game is still the
active window.

`traits.inputRegions` is set when overlays are layer surfaces. The input hook
then sees no pointer events over an overlay, so the app passes panel rects to
`windowTracker.setInputRegion()` instead of hit testing and toggling
click-through. Every window drawn over the game takes its web preferences from
`windowTracker.overlayWebPreferences()` and is passed to
`windowTracker.adoptSurface()` right after construction.
