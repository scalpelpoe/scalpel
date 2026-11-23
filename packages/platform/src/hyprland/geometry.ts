/** Chromium's X11 SetBounds path shrinks a monitor-sized window by one pixel.
 * Let the compositor configure the mapped overlay instead. Read both windows
 * in the same callback, so a stale poll cannot move another window or workspace.
 */
export function hyprlandGeometryScript(overlayAddress: string, gameAddress: string, pid: number): string {
  if (
    ![overlayAddress, gameAddress].every((address) => /^0x[0-9a-f]+$/i.test(address)) ||
    overlayAddress === gameAddress ||
    !Number.isSafeInteger(pid) ||
    pid <= 0
  ) {
    throw new Error('Invalid Hyprland geometry target')
  }
  return `
local overlay = hl.get_window("address:${overlayAddress}")
local game = hl.get_window("address:${gameAddress}")
if not overlay or not game or not overlay.mapped or not game.mapped then return end
if overlay.pid ~= ${pid} or not overlay.title:match("^Scalpel Overlay") then return end
if not overlay.floating or overlay.workspace.id ~= game.workspace.id then return end
local size = game.size
local at = game.at
if size.x <= 0 or size.y <= 0 then return end
if overlay.size.x ~= size.x or overlay.size.y ~= size.y then
  hl.dispatch(hl.dsp.window.resize({ window = "address:${overlayAddress}", x = size.x, y = size.y, relative = false }))
end
-- Resizing a floating window can move its origin. Check position afterwards.
if overlay.at.x ~= at.x or overlay.at.y ~= at.y then
  hl.dispatch(hl.dsp.window.move({ window = "address:${overlayAddress}", x = at.x, y = at.y, relative = false }))
end
`
}
