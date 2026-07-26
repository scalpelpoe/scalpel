import type { GameCaptureStreamFailure } from '../../../plugin-sdk/src/types'
import { clientFrameGeometry, normalizeGameRect } from '@shared/game-capture-stream'
import type { CaptureBrokerCommand, CaptureBrokerResponse } from '@shared/game-capture-stream-protocol'

const FIRST_FRAME_TIMEOUT_MS = 3_000

const video = document.createElement('video')
video.autoplay = false
video.muted = true
video.playsInline = true
document.body.append(video)

const canvas = document.createElement('canvas')
const maybeContext = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
if (!maybeContext) throw new Error('The capture broker could not create a 2D canvas context.')
const context: CanvasRenderingContext2D = maybeContext
document.body.append(canvas)

let stream: MediaStream | null = null
let currentStart: Promise<void> | null = null
let fatalReported = false

function failure(
  kind: GameCaptureStreamFailure['kind'],
  stage: GameCaptureStreamFailure['stage'],
  caught: unknown,
): GameCaptureStreamFailure {
  const message = caught instanceof Error ? caught.message : String(caught)
  const name = caught instanceof Error && caught.name ? caught.name : undefined
  return {
    kind,
    stage,
    message,
    ...(name ? { name } : {}),
  }
}

function post(response: CaptureBrokerResponse): void {
  window.api.captureBrokerRespond(response)
}

function stopStream(): void {
  currentStart = null
  if (stream) {
    for (const track of stream.getTracks()) track.stop()
  }
  stream = null
  video.pause()
  video.srcObject = null
}

function waitForFirstFrame(): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve()
  }
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new DOMException('Timed out waiting for the first game stream frame.', 'TimeoutError'))
    }, FIRST_FRAME_TIMEOUT_MS)
    const ready = (): void => {
      if (video.videoWidth <= 0 || video.videoHeight <= 0) return
      cleanup()
      resolve()
    }
    const failed = (): void => {
      cleanup()
      reject(video.error ?? new DOMException('The game stream could not provide a video frame.', 'NotReadableError'))
    }
    const cleanup = (): void => {
      window.clearTimeout(timer)
      video.removeEventListener('loadeddata', ready)
      video.removeEventListener('canplay', ready)
      video.removeEventListener('error', failed)
    }
    video.addEventListener('loadeddata', ready)
    video.addEventListener('canplay', ready)
    video.addEventListener('error', failed)
  })
}

async function ensureStarted(): Promise<void> {
  if (
    stream &&
    stream.getVideoTracks().some((track) => track.readyState === 'live') &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  ) {
    return
  }
  if (currentStart) return currentStart

  currentStart = (async () => {
    stopStream()
    fatalReported = false
    let opened: MediaStream
    try {
      opened = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: { frameRate: { ideal: 30, max: 30 } },
      })
    } catch (caught) {
      throw failure('stream-start-failed', 'get-display-media', caught)
    }
    stream = opened
    const [track] = opened.getVideoTracks()
    track?.addEventListener(
      'ended',
      () => {
        if (fatalReported || stream !== opened) return
        fatalReported = true
        post({
          type: 'fatal',
          failure: failure(
            'session-crashed',
            'capture-session',
            new DOMException('The game capture track ended unexpectedly.', 'NotReadableError'),
          ),
        })
      },
      { once: true },
    )
    video.srcObject = opened
    try {
      await video.play()
      await waitForFirstFrame()
    } catch (caught) {
      stopStream()
      if (
        typeof caught === 'object' &&
        caught !== null &&
        'kind' in caught &&
        'stage' in caught &&
        'message' in caught
      ) {
        throw caught
      }
      throw failure('video-frame-failed', 'first-video-frame', caught)
    }
  })().finally(() => {
    currentStart = null
  })
  return currentStart
}

async function handle(command: CaptureBrokerCommand): Promise<void> {
  if (command.type === 'stop') {
    stopStream()
    post({ requestId: command.requestId, type: 'stopped' })
    return
  }

  try {
    await ensureStarted()
    if (command.type === 'start') {
      post({
        requestId: command.requestId,
        type: 'started',
        frameSize: { width: video.videoWidth, height: video.videoHeight },
      })
      return
    }

    if (!stream || video.videoWidth <= 0 || video.videoHeight <= 0) {
      throw new DOMException('The game stream has no readable frame.', 'NotReadableError')
    }
    const requested = normalizeGameRect(command.region, command.gameSize)
    const geometry = clientFrameGeometry(
      { width: video.videoWidth, height: video.videoHeight },
      command.gameSize,
      command.displayScaleFactor,
    )
    const sourceX = geometry.offsetX + requested.x * geometry.scaleX
    const sourceY = geometry.offsetY + requested.y * geometry.scaleY
    const sourceWidth = Math.max(1, requested.width * geometry.scaleX)
    const sourceHeight = Math.max(1, requested.height * geometry.scaleY)
    const outputWidth = Math.max(1, Math.round(requested.width))
    const outputHeight = Math.max(1, Math.round(requested.height))
    canvas.width = outputWidth
    canvas.height = outputHeight
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight)
    const pixels = context.getImageData(0, 0, outputWidth, outputHeight).data
    post({
      requestId: command.requestId,
      type: 'captured',
      pixels,
      width: outputWidth,
      height: outputHeight,
      origin: { x: requested.x, y: requested.y },
      scale: outputWidth / requested.width,
    })
  } catch (caught) {
    const normalized =
      typeof caught === 'object' && caught !== null && 'kind' in caught && 'stage' in caught && 'message' in caught
        ? (caught as GameCaptureStreamFailure)
        : failure('frame-read-failed', 'read-frame', caught)
    post({ requestId: command.requestId, type: 'failed', failure: normalized })
  }
}

let queue = Promise.resolve()
window.api.onCaptureBrokerCommand((command) => {
  queue = queue.then(() => handle(command))
})
window.api.captureBrokerReady()
