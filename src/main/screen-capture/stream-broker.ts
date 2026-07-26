import { OverlayController } from 'electron-overlay-window'
import type { GameCapture, GameCaptureStreamFrame, GameCaptureStreamStatus, GameRect } from '../../plugin-sdk/src/types'
import { CaptureStreamSessionError, ElectronCaptureStreamSession, type CaptureStreamSession } from './stream-session'

const MAX_AUTOMATIC_HEAVY_ATTEMPTS = 2
const SOURCE_RETRY_BASE_MS = 500
const SOURCE_RETRY_MAX_MS = 5_000
const CLIENT_LEASE_TTL_MS = 10_000

export interface GameCaptureStreamBrokerDeps {
  hasGameFocus: () => boolean
  createSession: (generation: number) => CaptureStreamSession
  now: () => number
  setTimer: (handler: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void
}

function defaultDeps(): GameCaptureStreamBrokerDeps {
  return {
    hasGameFocus: () => OverlayController.targetHasFocus,
    createSession: (generation) => new ElectronCaptureStreamSession(generation),
    now: () => Date.now(),
    setTimer: (handler, delayMs) => setTimeout(handler, delayMs),
    clearTimer: (timer) => clearTimeout(timer),
  }
}

export class GameCaptureStreamBroker {
  private readonly deps: GameCaptureStreamBrokerDeps
  private readonly clients = new Map<string, number>()
  private session: CaptureStreamSession | undefined
  private unsubscribeFatal: (() => void) | undefined
  private queue = Promise.resolve()
  private leaseTimer: ReturnType<typeof setTimeout> | undefined
  private started = false
  private disposed = false
  private sessionGeneration = 0
  private recoveryCount = 0
  private openFailures = 0
  private sourceResolveMisses = 0
  private nextRetryAt = 0
  private automaticRetrySuppressed = false
  private state: GameCaptureStreamStatus['state'] = 'idle'
  private lastFailure: GameCaptureStreamStatus['lastFailure']

  constructor(deps: Partial<GameCaptureStreamBrokerDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps }
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work)
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private ensureSession(): CaptureStreamSession {
    if (this.session) return this.session
    this.sessionGeneration += 1
    const session = this.deps.createSession(this.sessionGeneration)
    this.session = session
    this.unsubscribeFatal = session.onFatal((error) => {
      void this.enqueue(async () => {
        if (this.session !== session || this.disposed) return
        this.recordHeavyFailure(error)
        this.destroySession()
      })
    })
    return session
  }

  private destroySession(): void {
    this.unsubscribeFatal?.()
    this.unsubscribeFatal = undefined
    this.session?.destroy()
    this.session = undefined
    this.started = false
  }

  private stopLeaseTimer(): void {
    if (!this.leaseTimer) return
    this.deps.clearTimer(this.leaseTimer)
    this.leaseTimer = undefined
  }

  private scheduleLeaseExpiry(): void {
    this.stopLeaseTimer()
    this.leaseTimer = this.deps.setTimer(() => {
      void this.enqueue(async () => {
        const cutoff = this.deps.now() - CLIENT_LEASE_TTL_MS
        for (const [pluginId, lastSeen] of this.clients) {
          if (lastSeen <= cutoff) this.clients.delete(pluginId)
        }
        if (this.clients.size === 0) await this.stopStream('idle')
        else this.scheduleLeaseExpiry()
      })
    }, CLIENT_LEASE_TTL_MS)
  }

  private recordSourceMiss(error: CaptureStreamSessionError): void {
    this.sourceResolveMisses += 1
    this.lastFailure = error.failure
    this.nextRetryAt =
      this.deps.now() +
      Math.min(SOURCE_RETRY_MAX_MS, SOURCE_RETRY_BASE_MS * 2 ** Math.max(0, this.sourceResolveMisses - 1))
    this.state = 'cooldown'
  }

  private recordHeavyFailure(error: CaptureStreamSessionError): void {
    this.openFailures += 1
    this.lastFailure = error.failure
    this.nextRetryAt = 0
    if (this.openFailures >= MAX_AUTOMATIC_HEAVY_ATTEMPTS) {
      this.automaticRetrySuppressed = true
      this.state = 'blocked'
    } else {
      this.recoveryCount += 1
      this.state = 'recovering'
    }
  }

  private clearTransientFailure(): void {
    this.openFailures = 0
    this.sourceResolveMisses = 0
    this.nextRetryAt = 0
    this.automaticRetrySuppressed = false
    this.lastFailure = undefined
  }

  private status(): GameCaptureStreamStatus {
    const session = this.session
    return {
      backend: 'isolated-session-stream',
      state: this.state,
      ready: this.state === 'ready',
      sessionGeneration: this.sessionGeneration,
      recoveryCount: this.recoveryCount,
      openFailures: this.openFailures,
      sourceResolveMisses: this.sourceResolveMisses,
      automaticRetrySuppressed: this.automaticRetrySuppressed,
      ...(session?.sourceId ? { sourceId: session.sourceId } : {}),
      ...(session?.frameSize ? { frameSize: session.frameSize } : {}),
      ...(session?.gameSize ? { gameSize: session.gameSize } : {}),
      ...(this.nextRetryAt ? { nextRetryAt: this.nextRetryAt } : {}),
      ...(this.lastFailure ? { lastFailure: this.lastFailure } : {}),
    }
  }

  private async stopStream(nextState: GameCaptureStreamStatus['state']): Promise<void> {
    if (this.started) await this.session?.stop()
    this.started = false
    if (!this.automaticRetrySuppressed) this.state = nextState
  }

  private async captureAttempt(region: GameRect | undefined, allowRecovery: boolean): Promise<GameCapture | null> {
    if (this.automaticRetrySuppressed) return null
    if (this.nextRetryAt > this.deps.now()) {
      this.state = 'cooldown'
      return null
    }

    const session = this.ensureSession()
    try {
      if (!this.started) {
        this.state = this.openFailures > 0 ? 'recovering' : 'starting'
        await session.start()
        this.started = true
        this.sourceResolveMisses = 0
        this.nextRetryAt = 0
      }
      const capture = await session.capture(region)
      this.clearTransientFailure()
      this.state = 'ready'
      return capture
    } catch (caught) {
      const error =
        caught instanceof CaptureStreamSessionError
          ? caught
          : new CaptureStreamSessionError(
              {
                kind: 'session-crashed',
                stage: 'capture-session',
                message: caught instanceof Error ? caught.message : String(caught),
                ...(caught instanceof Error && caught.name ? { name: caught.name } : {}),
              },
              true,
            )
      if (!error.heavy) {
        this.recordSourceMiss(error)
        return null
      }

      this.recordHeavyFailure(error)
      this.destroySession()
      if (allowRecovery && !this.automaticRetrySuppressed) {
        return this.captureAttempt(region, false)
      }
      return null
    }
  }

  async capture(pluginId: string, region?: GameRect): Promise<GameCaptureStreamFrame> {
    return this.enqueue(async () => {
      if (this.disposed) return { capture: null, status: this.status() }
      this.clients.set(pluginId, this.deps.now())
      this.scheduleLeaseExpiry()
      if (!this.deps.hasGameFocus()) {
        await this.stopStream('suspended')
        return { capture: null, status: this.status() }
      }
      const capture = await this.captureAttempt(region, true)
      return { capture, status: this.status() }
    })
  }

  async reset(pluginId: string): Promise<GameCaptureStreamStatus> {
    return this.enqueue(async () => {
      this.clients.set(pluginId, this.deps.now())
      this.stopLeaseTimer()
      this.destroySession()
      this.openFailures = 0
      this.sourceResolveMisses = 0
      this.nextRetryAt = 0
      this.automaticRetrySuppressed = false
      this.lastFailure = undefined
      this.state = 'idle'
      this.scheduleLeaseExpiry()
      return this.status()
    })
  }

  async release(pluginId: string): Promise<void> {
    await this.enqueue(async () => {
      this.clients.delete(pluginId)
      if (this.clients.size === 0) {
        this.stopLeaseTimer()
        await this.stopStream('idle')
      }
    })
  }

  async dispose(): Promise<void> {
    await this.enqueue(async () => {
      if (this.disposed) return
      this.disposed = true
      this.stopLeaseTimer()
      this.clients.clear()
      await this.stopStream('idle')
      this.destroySession()
    })
  }
}
