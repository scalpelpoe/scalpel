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

Hyprland is selected inside a Hyprland session from 0.56 on and needs `grim`
on PATH. Other Wayland compositors keep the X11 tracker until they have their
own backend.

## Startup

`relaunchArgs` tells the app, before any window exists, whether to relaunch
Electron on another Ozone platform. Every backend is an X11 client today, so a
Wayland session relaunches under XWayland unless the user picked a platform.

## Input

All backends use uiohook-napi for global key and mouse hooks and for key
injection. Key codes are `Key` values (PC scancodes). A hook that only sees
physical devices reports `seesInjectedKeys: false` and answers
`physicallyHeld()`, so the app can track held modifiers while it injects keys.

## Shortcuts and clipboard

All backends use Electron's `globalShortcut` and `clipboard`. A backend whose
session hides the clipboard from unfocused windows, or has no global shortcut
service, supplies its own implementations instead.

## Coordinates

- `windowTracker.gameBounds()`, `cursor.screenPoint()` and `cursor.warpTo()`
  use Electron DIP.
- `windowTracker.targetBounds`, input hook pointer events and
  `cursor.trackerPoint()` use the tracker's space, which is physical pixels on
  Windows and X11.
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
