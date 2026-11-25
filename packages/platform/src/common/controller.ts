import { OverlayController } from 'electron-overlay-window'
import type { WindowTracker } from '../types'

type ControllerMembers =
  | 'events'
  | 'targetBounds'
  | 'targetHasFocus'
  | 'setTargetTitles'
  | 'focusTarget'
  | 'activateOverlay'
  | 'setInputRects'

/** A window tracker over electron-overlay-window's controller. Backends that
 *  track the game differently still report through the controller, replacing
 *  its methods and emitting its events, so these members read it at call time. */
export function controllerTracker(
  backend: Omit<WindowTracker, ControllerMembers> & Partial<Pick<WindowTracker, ControllerMembers | 'setInputRects'>>,
): WindowTracker {
  return {
    setInputRects: () => {},
    events: {
      on: (event, listener) => {
        OverlayController.events.on(event, listener)
      },
    },
    get targetBounds() {
      return OverlayController.targetBounds
    },
    get targetHasFocus() {
      return OverlayController.targetHasFocus
    },
    setTargetTitles: (titles) => OverlayController.setTargetTitles(titles),
    focusTarget: () => OverlayController.focusTarget(),
    activateOverlay: () => OverlayController.activateOverlay(),
    ...backend,
  }
}
