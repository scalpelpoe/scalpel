import { execFileSync, spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { hyprlandFocusScript } from './hyprland-focus'

describe('Hyprland focus script', () => {
  it('rejects invalid selectors before constructing Lua', () => {
    expect(() => hyprlandFocusScript('bad"selector', '0x2', 1)).toThrow()
    expect(() => hyprlandFocusScript('0x1', '0x2', 0)).toThrow()
  })
  // Exercise the actual generated callback when a Lua interpreter is available.
  describe.skipIf(spawnSync('lua', ['-v']).status !== 0)('Lua handoff', () => {
    for (const fail of [false, true]) {
      it(`transfers pointer and keyboard focus and restores policies (failure=${fail})`, () => {
        const script = `
local config = { ["cursor.no_warps"] = false, ["input.follow_mouse"] = 1 }
local target = { address = "0x1", workspace = { id = 2 } }
local game = { address = "0x2", workspace = { id = 2 } }
local dispatched = false
hl = {
  get_window = function(s) return s == "address:0x1" and target or game end,
  get_active_window = function() return game end,
  get_config = function(k) return config[k] end,
  config = function(c)
    config["cursor.no_warps"] = c.cursor.no_warps
    config["input.follow_mouse"] = c.input.follow_mouse
  end,
  dsp = { focus = function(args) return args end },
  dispatch = function(args)
    assert(args.window == "address:0x1")
    assert(config["cursor.no_warps"] == true)
    assert(config["input.follow_mouse"] == 0)
    dispatched = true
    ${fail ? 'error("simulated failure")' : ''}
  end,
}
local ok = pcall(function()
${hyprlandFocusScript('0x1', '0x2', 10)}
end)
assert(ok == ${!fail})
assert(dispatched)
assert(config["cursor.no_warps"] == false)
assert(config["input.follow_mouse"] == 1)
`
        expect(() => execFileSync('lua', ['-'], { input: script })).not.toThrow()
      })
    }
  })
})
