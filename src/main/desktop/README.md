# Desktop backend

Feature code uses `desktop` for game bounds, cursor reads/restoration, focus and
capture. Screen coordinates at this boundary are **Electron DIP**, and game-local
coordinates are relative to `getGameBounds()`. Capture results separately carry
pixel dimensions and `scale` for conversion into those game coordinates.

- Hyprland: compositor geometry and cursor IPC, mapping-aware focus requests,
  guarded cursor restoration, and `grim` capture. Requires Hyprland 0.56+ and
  `grim` on PATH. Other Wayland compositors need their own adapter.
- Native Wayland with wlr-layer-shell v4 and a virtual keyboard (not GNOME,
  which lacks layer-shell, nor KWin, which lacks the virtual keyboard):
  Scalpel relaunches with `--ozone-platform=wayland` and overlay windows render
  offscreen into layer surfaces (`layer-shell.ts`). Game bounds are the logical
  bounds of the game's output, so the game must be fullscreen or borderless
  fullscreen. Panel rects become input regions instead of uiohook hit tests.
  Nothing goes through XWayland. The game may run on XWayland, but items it
  copies may not reach the data-control clipboard (seen with
  xwayland-satellite), so a native game is preferred:
  - `input.ts` keeps uiohook's API but reads keys, buttons and the wheel from
    evdev (the user needs read access to `/dev/input`, usually the `input`
    group) while the game has focus, and types with a Wayland virtual keyboard.
  - Global shortcuts (`native-shortcuts.ts`) match those evdev presses and keys
    typed into overlays. The game also receives the key.
  - The cursor comes from the overlay surface under it, or else a short
    compositor probe (`desktop.refreshCursor()`); warps use a virtual pointer.
  - Capture uses wlr-screencopy of the game's area, falling back to the
    screen-cast portal.
  - The clipboard comes from the host's data-control connection (`clipboard.ts`).

  Pass `--ozone-platform=x11` to use XWayland instead.
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
