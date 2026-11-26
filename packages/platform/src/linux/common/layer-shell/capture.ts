import { desktopCapturer, screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import { reportBreadcrumb } from '../../../common/diagnostics'
import { getAllGameTitles } from '../../../common/game-window-identity'
import type { CaptureFailure, CaptureResult } from '../../../types'
import { matchBestGameWindowSource, matchGameWindowSource } from '../../../common/electron-window-source'
import { nativeOverlayServices, overlayGameHasKeyboardFocus } from '../native-overlay'

const MAX_CAPTURE_HEIGHT = 1080

function fail(failure: CaptureFailure): CaptureResult {
  if (process.env.SCALPEL_DEBUG_LOG) reportBreadcrumb(`layer-shell capture failed=${failure}`, 'debug')
  return { frame: null, failure }
}

/**
 * Capture through the active native overlay backend. Compositor screencopy is
 * preferred; desktopCapturer window sources are the fallback for hosts where
 * screencopy was disabled. Every case returns a typed failure instead of a
 * bare null so callers can explain what went wrong.
 */
export async function captureLayerShellGame(skipFocusGate = false, title?: string): Promise<CaptureResult> {
  if (!skipFocusGate && !OverlayController.targetHasFocus && !overlayGameHasKeyboardFocus()) return fail('focus')
  const tb = OverlayController.targetBounds
  if (!tb?.width || !tb.height) return fail('bounds')
  const services = nativeOverlayServices()
  if (!services) return fail('bounds')

  if (services.features.desktopCapturerSourcePickerUnsafe && !services.features.screencopy) {
    // Some compositors expose unnamed desktopCapturer sources under layer-shell;
    // asking for them pops an interactive source picker on every capture.
    return fail('no-source')
  }

  if (services.features.screencopy && services.native.canCapture()) {
    try {
      const shot = await services.native.capture({ x: tb.x, y: tb.y, width: tb.width, height: tb.height })
      if (!shot) return fail('error')
      return {
        frame: {
          data: shot.data,
          width: shot.width,
          height: shot.height,
          gameSize: { width: tb.width, height: tb.height },
          scale: shot.width / tb.width,
        },
      }
    } catch (error) {
      reportBreadcrumb(`layer-shell screencopy failed error=${String(error)}`, 'debug')
      return fail('error')
    }
  }

  try {
    const display = screen.getDisplayNearestPoint({ x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 })
    const capScale = Math.min(1, MAX_CAPTURE_HEIGHT / (tb.height * display.scaleFactor))
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: {
        width: Math.round(tb.width * display.scaleFactor * capScale),
        height: Math.round(tb.height * display.scaleFactor * capScale),
      },
    })
    const titles = title ? [title] : getAllGameTitles()
    const sourceId = title ? matchGameWindowSource(sources, title, titles) : matchBestGameWindowSource(sources, titles)
    const source = sources.find((s) => s.id === sourceId)
    if (!source) return fail('no-source')

    const img = source.thumbnail
    const { width, height } = img.getSize()
    if (width === 0 || height === 0) return fail('empty-frame')
    return {
      frame: {
        data: img.toBitmap(),
        width,
        height,
        gameSize: { width: tb.width, height: tb.height },
        scale: width / tb.width,
      },
    }
  } catch (error) {
    reportBreadcrumb(`layer-shell window capture failed error=${String(error)}`, 'debug')
    return fail('error')
  }
}
