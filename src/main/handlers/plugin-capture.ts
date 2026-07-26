import { app, ipcMain } from 'electron'
import type { GameCapture, GameCaptureStreamFrame, GameCaptureStreamStatus, GameRect } from '../../plugin-sdk/src/types'
import { captureGameWindow, type CaptureFrame } from '../screen-capture/capture'
import { bgraToRgba, cropFrame } from '../screen-capture/pixels'
import { GameCaptureStreamBroker } from '../screen-capture/stream-broker'

const streamBroker = new GameCaptureStreamBroker()
let quitHookRegistered = false

/** Map a BGRA CaptureFrame to the plugin-facing RGBA GameCapture, optionally
 *  cropping to `region` (game CSS px). Pure; the IPC handler is glue around it. */
export function frameToCapture(frame: CaptureFrame, region: GameRect | undefined): GameCapture {
  if (!region) {
    return {
      pixels: bgraToRgba(frame.data),
      width: frame.width,
      height: frame.height,
      origin: { x: 0, y: 0 },
      gameSize: frame.gameSize,
      scale: frame.scale,
    }
  }
  // region is CSS px; convert to frame px via scale, then crop.
  const cropped = cropFrame(frame.data, frame.width, {
    x: Math.round(region.x * frame.scale),
    y: Math.round(region.y * frame.scale),
    width: Math.round(region.width * frame.scale),
    height: Math.round(region.height * frame.scale),
  })
  return {
    pixels: bgraToRgba(cropped.data),
    width: cropped.width,
    height: cropped.height,
    origin: { x: region.x, y: region.y },
    gameSize: frame.gameSize,
    scale: frame.scale,
  }
}

export function registerPluginCaptureHandlers(): void {
  ipcMain.handle(
    'plugins:capture-game-window',
    async (_evt, region: GameRect | undefined): Promise<GameCapture | null> => {
      const frame = await captureGameWindow()
      if (!frame) return null
      return frameToCapture(frame, region)
    },
  )
  ipcMain.handle(
    'plugins:capture-game-window-stream-frame',
    async (evt, pluginId: string, region: GameRect | undefined): Promise<GameCaptureStreamFrame> =>
      streamBroker.capture(`${pluginId}:${evt.sender.id}`, region),
  )
  ipcMain.handle(
    'plugins:reset-game-window-capture-stream',
    async (evt, pluginId: string): Promise<GameCaptureStreamStatus> =>
      streamBroker.reset(`${pluginId}:${evt.sender.id}`),
  )
  ipcMain.handle(
    'plugins:release-game-window-capture-stream',
    async (evt, pluginId: string): Promise<void> => streamBroker.release(`${pluginId}:${evt.sender.id}`),
  )
  if (!quitHookRegistered) {
    quitHookRegistered = true
    app.on('will-quit', () => {
      void streamBroker.dispose()
    })
  }
}
