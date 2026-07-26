import type { GameCaptureStreamFailure } from '../plugin-sdk/src/types'
import type { CaptureRect } from './game-capture-stream'

export const CAPTURE_BROKER_COMMAND_EVENT = 'capture-broker:command'
export const CAPTURE_BROKER_RESPONSE_EVENT = 'capture-broker:response'
export const CAPTURE_BROKER_READY_EVENT = 'capture-broker:ready'

export type CaptureBrokerCommand =
  | {
      requestId: string
      type: 'start'
      gameSize: { width: number; height: number }
      displayScaleFactor: number
    }
  | {
      requestId: string
      type: 'capture'
      region?: CaptureRect
      gameSize: { width: number; height: number }
      displayScaleFactor: number
    }
  | {
      requestId: string
      type: 'stop'
    }

export type CaptureBrokerResponse =
  | {
      requestId: string
      type: 'started'
      frameSize: { width: number; height: number }
    }
  | {
      requestId: string
      type: 'captured'
      pixels: Uint8ClampedArray
      width: number
      height: number
      origin: { x: number; y: number }
      scale: number
    }
  | {
      requestId: string
      type: 'stopped'
    }
  | {
      requestId: string
      type: 'failed'
      failure: GameCaptureStreamFailure
    }
  | {
      type: 'fatal'
      failure: GameCaptureStreamFailure
    }
