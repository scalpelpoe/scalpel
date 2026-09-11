/** Run the focus handoff and restore the user's cursor policy in one compositor
 * callback. Separate IPC calls would leave a window for cursor warps or a stuck
 * setting if Scalpel exits between them. */
export function hyprlandFocusScript(targetAddress: string, gameAddress: string, pid: number): string {
  if (
    ![targetAddress, gameAddress].every((address) => /^0x[0-9a-f]+$/i.test(address)) ||
    !Number.isSafeInteger(pid) ||
    pid <= 0
  ) {
    throw new Error('Invalid Hyprland focus target')
  }
  return `
local target = hl.get_window("address:${targetAddress}")
local game = hl.get_window("address:${gameAddress}")
local active = hl.get_active_window()
if not target or not game or not active then return end
if active.workspace.id ~= game.workspace.id or target.workspace.id ~= game.workspace.id then return end
if active.address ~= game.address and not (active.pid == ${pid} and active.title:match("^Scalpel Overlay")) then return end
if active.address == target.address then return end
local original = hl.get_config("cursor.no_warps")
local followMouse = hl.get_config("input.follow_mouse")
if type(original) ~= "boolean" then error("Cannot read cursor warp policy") end
if type(followMouse) ~= "number" then error("Cannot read pointer focus policy") end
-- In Hyprland 0.56, rawWindowFocus only sends pointer enter to the new
-- surface when follow_mouse is 0. Otherwise keyboard focus changes but
-- pointer focus waits for physical movement (Alt-Tab uses a different path).
hl.config({ cursor = { no_warps = true }, input = { follow_mouse = 0 } })
local ok, err = pcall(function()
  hl.dispatch(hl.dsp.focus({ window = "address:${targetAddress}" }))
end)
hl.config({ cursor = { no_warps = original }, input = { follow_mouse = followMouse } })
if not ok then error(err) end
`
}
