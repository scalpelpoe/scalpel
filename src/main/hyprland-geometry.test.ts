import { expect, it } from 'vitest'
import { hyprlandGeometryScript } from './hyprland-geometry'

it.each([
  ['0x1', '0x1', 10],
  ['not-an-address', '0x2', 10],
  ['0x1', '0x2"; error("injected")', 10],
  ['0x1', '0x2', 0],
  ['0x1', '0x2', NaN],
] as const)('refuses unsafe or identical geometry targets (%s, %s, %s)', (overlay, game, pid) => {
  expect(() => hyprlandGeometryScript(overlay, game, pid)).toThrow('Invalid Hyprland geometry target')
})
