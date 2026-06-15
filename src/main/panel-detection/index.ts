import type { PanelState } from '@shared/panel-state'
import { getPoeVersion } from '../game-state'
import { captureGameWindow } from '../screen-capture/capture'
import { matchPatchFuzzy, votePanels } from './match'
import { PANEL_SAMPLES } from './panel-samples'

let lastPanelState: PanelState = { leftPanelOpen: false, rightPanelOpen: false }

/** Last detected panel state; returned by detectPanelStateOnce callers. */
export function getCurrentPanelState(): PanelState {
  return lastPanelState
}

/** One-shot panel-state detection. Captures a single frame and fuzzy-matches
 *  the sample patches (no stabilization fingerprint - this is a cold, on-demand
 *  read). Updates and returns lastPanelState; returns the previous state
 *  unchanged when samples are unavailable for the version or no frame could be
 *  captured (e.g. PoE not focused). Intended for features that need fresh panel
 *  state at a specific moment (e.g. a hotkey press) rather than continuously. */
export async function detectPanelStateOnce(): Promise<PanelState> {
  const samples = PANEL_SAMPLES[getPoeVersion()]
  if (!samples) return lastPanelState
  const frame = await captureGameWindow()
  if (!frame) return lastPanelState
  const matched = samples.map((s) => matchPatchFuzzy(frame, s))
  lastPanelState = votePanels(samples, matched)
  return lastPanelState
}
