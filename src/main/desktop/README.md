# Desktop backend

Feature code uses `desktop` for game bounds, cursor reads/restoration, focus and
capture. Screen coordinates at this boundary are **Electron DIP**, and game-local
coordinates are relative to `getGameBounds()`. Capture results separately carry
pixel dimensions and `scale` for conversion into those game coordinates.

- Hyprland: compositor geometry and cursor IPC, mapping-aware focus requests,
  guarded cursor restoration, and `grim` capture. Requires Hyprland 0.56+ and
  `grim` on PATH. Other Wayland compositors need their own adapter.
- Windows: Electron geometry/capture and native cursor restoration.
- Other desktops: existing Electron capture and geometry path; cursor restoration
  remains unavailable where no native backend has been implemented.

Declare `OverlaySpec.interaction` for secondary overlays:

| Mode | Behavior |
| --- | --- |
| `dialog` | Claims input on show, holds it across pointer movement, returns focus on dismissal. Used by radial menus and whiteboard edit mode. |
| `panel` (default) | Interactive window without automatic focus on show. |
| `passthrough` | Click-through surface. An annotation's declared interactive regions can temporarily acquire input. |

The windowing layer reads this policy on every show, including after game focus
returns. Features with changing modes should also call `desktop.applyInteraction`
when changing modes while visible. Keep focus restoration before cursor warping:
Hyprland rejects item-targeting warps unless the game is still the active window.

Do not add direct `screenToDipRect`, `getCursorScreenPoint`, or native warp calls
to feature modules. Electron's rectangle conversion is Windows-only, and
XWayland coordinates do not necessarily equal compositor or physical pixels.

Regression coverage is in `desktop/*.test.ts`, `hyprland-desktop.test.ts`,
`windowing/window.test.ts`, and the radial, capture, and overlay tests.
