# Desktop policy

Feature code uses `desktop` for game bounds, cursor reads/restoration, focus and
capture. The OS work behind it lives in `@scalpel/platform`
(`packages/platform`), which documents the backends and coordinate spaces.
Screen coordinates at this boundary are **Electron DIP**, and game-local
coordinates are relative to `getGameBounds()`.

Declare `OverlaySpec.interaction` for secondary overlays:

| Mode | Behavior |
| --- | --- |
| `dialog` | Claims input on show, holds it across pointer movement, returns focus on dismissal. Used by radial menus and whiteboard edit mode. |
| `panel` (default) | Interactive window without automatic focus on show. |
| `passthrough` | Click-through surface. An annotation's declared interactive regions can temporarily acquire input. |

The windowing layer reads this policy on every show, including after game focus
returns. Features with changing modes should also call `desktop.applyInteraction`
when changing modes while visible. Keep focus restoration before cursor warping.
Await `desktop.refreshCursor()` before reading the cursor for a user action: on
native Wayland only the compositor knows where it is.

Do not import `electron-overlay-window`, `uiohook-napi` or native bindings in
feature modules, or call `screenToDipRect`, `getCursorScreenPoint` or native
warp functions directly. Key codes come from the package's `Key`.

Regression coverage is in `desktop/*.test.ts`, `windowing/window.test.ts`, the
radial, capture and overlay tests, and `packages/platform/src/**/*.test.ts`.
