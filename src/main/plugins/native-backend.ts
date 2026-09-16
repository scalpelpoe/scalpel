import { createHash } from 'node:crypto'
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { create, fromBinary, toBinary, type MessageInitShape } from '@bufbuild/protobuf'
import { NativeFrameSchema, type NativeFrame } from './generated/scalpel/plugin/native/v1/transport_pb'
import { getInstalledPlugins } from './manager'
import { nativeTargetForHost } from './native-platform'
import { pluginDir } from './paths'

const MAX_FRAME_BYTES = 1024 * 1024
const MAX_IN_FLIGHT = 32
const CALL_TIMEOUT_MS = 10_000
const STOP_TIMEOUT_MS = 750
const RESTART_COOLDOWN_MS = 5_000
const MAX_STDERR_BYTES = 8 * 1024
const MAX_QUEUED_STDIN_BYTES = 4 * 1024 * 1024
const METHOD_PATTERN = /^\/[A-Za-z_][A-Za-z0-9_.]*\/[A-Za-z_][A-Za-z0-9_]*$/

/** Machine-readable codes for every host-side native backend failure. Backend-emitted
 * `CallError` frames carry the plugin's own code instead. */
export const NATIVE_ERROR_CODES = {
  /** The backend is not usable right now: blocked, restarting, stopped, crashed or off-protocol. */
  UNAVAILABLE: 'UNAVAILABLE',
  /** A call or the initial handshake ran past its deadline. */
  DEADLINE_EXCEEDED: 'DEADLINE_EXCEEDED',
  /** The caller passed a method or payload the transport cannot send. */
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  /** A transport limit (in-flight calls, frame size, queued stdin bytes) was hit. */
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  /** The plugin has no usable native backend installed for this host. */
  FAILED_PRECONDITION: 'FAILED_PRECONDITION',
} as const

export type NativeErrorCode = (typeof NATIVE_ERROR_CODES)[keyof typeof NATIVE_ERROR_CODES]

interface NativeBackendDescriptor {
  executablePath: string
  sha256: string
  service: string
}

interface PendingCall {
  resolve(value: NativeFrame['body']): void
  reject(error: Error): void
  timer: NodeJS.Timeout
  responseCase: 'initializeResponse' | 'callResponse'
}

type SpawnBackend = (executablePath: string) => ChildProcessWithoutNullStreams
type ResolveBackend = (pluginId: string) => NativeBackendDescriptor

export class PluginNativeBackendManager {
  private readonly processes = new Map<string, NativeBackendProcess>()
  private readonly blockedPlugins = new Map<string, number>()
  private readonly restartBlockedPlugins = new Set<string>()
  private readonly restartCooldowns = new Map<string, number>()
  private blockAllCount = 0
  private lifecycleTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly resolveBackend: ResolveBackend = resolveInstalledBackend,
    private readonly spawnBackend: SpawnBackend = spawnInstalledBackend,
  ) {}

  async call(pluginId: string, method: string, payload: Uint8Array): Promise<Uint8Array> {
    if (
      this.blockAllCount > 0 ||
      this.restartBlockedPlugins.has(pluginId) ||
      (this.blockedPlugins.get(pluginId) ?? 0) > 0
    ) {
      throw nativeError(`native backend for plugin "${pluginId}" is temporarily unavailable`, 'UNAVAILABLE')
    }
    const cooldownUntil = this.restartCooldowns.get(pluginId)
    if (cooldownUntil !== undefined) {
      const remaining = cooldownUntil - Date.now()
      if (remaining > 0) {
        throw nativeError(
          `native backend for plugin "${pluginId}" is in restart cooldown (${remaining}ms remaining)`,
          'UNAVAILABLE',
        )
      }
      this.restartCooldowns.delete(pluginId)
    }
    if (!METHOD_PATTERN.test(method)) {
      throw nativeError('native backend method must be a fully qualified Protobuf method', 'INVALID_ARGUMENT')
    }
    if (!(payload instanceof Uint8Array)) {
      throw nativeError('native backend payload must be a Uint8Array', 'INVALID_ARGUMENT')
    }
    let backend = this.processes.get(pluginId)
    if (!backend) {
      let descriptor: NativeBackendDescriptor
      try {
        descriptor = this.resolveBackend(pluginId)
        verifyExecutable(descriptor)
      } catch (error) {
        throw toNativeError(error, 'FAILED_PRECONDITION')
      }
      let child: ChildProcessWithoutNullStreams
      try {
        child = this.spawnBackend(descriptor.executablePath)
      } catch (error) {
        this.restartCooldowns.set(pluginId, Date.now() + RESTART_COOLDOWN_MS)
        throw nativeError(`native backend failed to start: ${(error as Error).message}`, 'UNAVAILABLE')
      }
      backend = new NativeBackendProcess(pluginId, descriptor.service, child, {
        failed: () => this.restartCooldowns.set(pluginId, Date.now() + RESTART_COOLDOWN_MS),
        exited: () => {
          if (this.processes.get(pluginId) === backend) this.processes.delete(pluginId)
        },
      })
      this.processes.set(pluginId, backend)
    }
    await backend.ready
    return backend.call(method, Uint8Array.from(payload))
  }

  async stop(pluginId: string): Promise<void> {
    const backend = this.processes.get(pluginId)
    if (!backend) return
    await backend.stop()
    if (this.processes.get(pluginId) === backend) this.processes.delete(pluginId)
  }

  /** Stops every backend, keeping the ones that refused to die in the map so a later
   * stop can re-issue the escalation, and reports the plugins that stayed alive. */
  async stopAll(): Promise<void> {
    const entries = [...this.processes.entries()]
    const results = await Promise.allSettled(entries.map(([, backend]) => backend.stop()))
    const failedIds: string[] = []
    for (const [index, result] of results.entries()) {
      const [pluginId, backend] = entries[index]
      if (result.status === 'rejected') {
        failedIds.push(pluginId)
        continue
      }
      if (this.processes.get(pluginId) === backend) this.processes.delete(pluginId)
    }
    if (failedIds.length > 0) throw new Error(`native backends failed to stop: ${failedIds.join(', ')}`)
  }

  async shutdown(): Promise<void> {
    this.blockAllCount += 1
    await this.serializeLifecycle(async () => {
      await this.stopAll()
    })
  }

  async withPluginStopped<TResult>(pluginId: string, operation: () => TResult | Promise<TResult>): Promise<TResult> {
    this.blockedPlugins.set(pluginId, (this.blockedPlugins.get(pluginId) ?? 0) + 1)
    return this.serializeLifecycle(async () => {
      try {
        await this.stop(pluginId)
        return await operation()
      } finally {
        const remaining = (this.blockedPlugins.get(pluginId) ?? 1) - 1
        if (remaining > 0) this.blockedPlugins.set(pluginId, remaining)
        else this.blockedPlugins.delete(pluginId)
      }
    })
  }

  /** Stop before mutating files. A successful mutation stays blocked for the
   * rest of this process; a failed mutation restores normal worker spawning. */
  async withPluginStoppedUntilRestart<TResult>(
    pluginId: string,
    operation: () => TResult | Promise<TResult>,
    succeeded: (result: TResult) => boolean,
  ): Promise<TResult> {
    this.blockedPlugins.set(pluginId, (this.blockedPlugins.get(pluginId) ?? 0) + 1)
    return this.serializeLifecycle(async () => {
      try {
        await this.stop(pluginId)
        const result = await operation()
        if (succeeded(result)) this.restartBlockedPlugins.add(pluginId)
        return result
      } finally {
        const remaining = (this.blockedPlugins.get(pluginId) ?? 1) - 1
        if (remaining > 0) this.blockedPlugins.set(pluginId, remaining)
        else this.blockedPlugins.delete(pluginId)
      }
    })
  }

  isRestartRequired(): boolean {
    return this.restartBlockedPlugins.size > 0
  }

  /** Plugins whose on-disk package changed this session. They are excluded from
   * the loadable graph until restart; everything else keeps loading normally. */
  restartBlockedPluginIds(): ReadonlySet<string> {
    return new Set(this.restartBlockedPlugins)
  }

  /** Snapshot used by loadability queries to exclude packages while their files
   * are changing as well as packages whose changes require a restart. */
  loadBlockedPluginIds(): ReadonlySet<string> {
    return new Set([...this.restartBlockedPlugins, ...this.blockedPlugins.keys()])
  }

  async withAllStopped<TResult>(operation: () => TResult | Promise<TResult>): Promise<TResult> {
    this.blockAllCount += 1
    return this.serializeLifecycle(async () => {
      try {
        await this.stopAll()
        return await operation()
      } finally {
        this.blockAllCount -= 1
      }
    })
  }

  stopAllNow(): void {
    for (const backend of this.processes.values()) backend.stopNow()
    this.processes.clear()
  }

  private async serializeLifecycle<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    const previous = this.lifecycleTail
    let release!: () => void
    this.lifecycleTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }
}

class NativeBackendProcess {
  readonly ready: Promise<void>
  private readonly pending = new Map<number, PendingCall>()
  private nextId = 1
  private stdoutBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private stderr = ''
  private stopped = false
  private terminalError: NativeCallError | null = null
  private writeBlocked = false
  private queuedWriteBytes = 0
  private readonly queuedWrites: Array<{ id: number; frame: Buffer }> = []
  private readonly exited: Promise<void>
  private exitConfirmed = false
  private failureReported = false
  private exitReported = false
  private stopPromise: Promise<void> | null = null

  constructor(
    private readonly pluginId: string,
    private readonly service: string,
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly events: { failed(): void; exited(): void },
  ) {
    let confirmExit!: () => void
    this.exited = new Promise<void>((resolve) => {
      confirmExit = () => {
        if (this.exitConfirmed) return
        this.exitConfirmed = true
        resolve()
      }
    })
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: Buffer) => this.acceptStdout(chunk))
    child.stdout.on('error', (error) => {
      if (!this.stopped) this.fail(nativeError(`native backend stdout failed: ${error.message}`, 'UNAVAILABLE'))
    })
    child.stderr.on('data', (chunk: string) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-MAX_STDERR_BYTES)
    })
    child.stderr.on('error', (error) => {
      if (!this.stopped) this.fail(nativeError(`native backend stderr failed: ${error.message}`, 'UNAVAILABLE'))
    })
    child.stdin.on('drain', () => {
      this.writeBlocked = false
      this.flushWrites()
    })
    child.stdin.on('error', (error) => {
      if (!this.stopped) this.fail(nativeError(`native backend stdin failed: ${error.message}`, 'UNAVAILABLE'))
    })
    child.on('error', (error) =>
      this.fail(nativeError(`native backend process error: ${error.message}`, 'UNAVAILABLE')),
    )
    child.once('exit', (code, signal) => {
      confirmExit()
      if (this.stopped) return this.reportExit()
      const detail = this.stderr.trim()
      this.fail(
        nativeError(
          `native backend exited (${signal ? `signal ${signal}` : `code ${String(code)}`})${detail ? `: ${detail}` : ''}`,
          'UNAVAILABLE',
        ),
      )
      this.reportExit()
    })
    child.once('close', () => {
      confirmExit()
      if (!this.stopped) this.fail(nativeError('native backend closed unexpectedly', 'UNAVAILABLE'))
      this.reportExit()
    })
    this.ready = this.request(
      {
        case: 'initializeRequest',
        value: { protocolVersion: 1, pluginId, service },
      },
      'initialize',
      'initializeResponse',
      0,
    ).then((body) => {
      if (
        body.case !== 'initializeResponse' ||
        body.value.protocolVersion !== 1 ||
        body.value.pluginId !== pluginId ||
        body.value.service !== service
      ) {
        throw nativeError('native backend returned an invalid protocol handshake', 'UNAVAILABLE')
      }
    })
    this.ready.catch((error) => this.fail(toNativeError(error, 'UNAVAILABLE')))
  }

  async call(method: string, payload: Uint8Array): Promise<Uint8Array> {
    if (!method.startsWith(`/${this.service}/`)) {
      throw nativeError(`native backend method must belong to service "${this.service}"`, 'INVALID_ARGUMENT')
    }
    const body = await this.request({ case: 'callRequest', value: { method, payload } }, method, 'callResponse')
    if (body.case !== 'callResponse')
      throw nativeError('native backend returned an invalid call response', 'UNAVAILABLE')
    return Uint8Array.from(body.value.payload)
  }

  /** A rejected stop is forgotten so the next stop re-issues the SIGTERM/SIGKILL escalation. */
  async stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise
    const attempt: Promise<void> = this.stopConfirmed().catch((error: unknown) => {
      if (this.stopPromise === attempt) this.stopPromise = null
      throw error
    })
    this.stopPromise = attempt
    return attempt
  }

  private async stopConfirmed(): Promise<void> {
    if (this.exitConfirmed) {
      this.reportExit()
      return
    }
    if (!this.stopped) {
      this.stopped = true
      this.terminalError = nativeError('native backend stopped', 'UNAVAILABLE')
      this.rejectPending(this.terminalError)
      this.child.stdin.end()
    }
    if (await this.waitForExit()) return
    this.child.kill('SIGTERM')
    if (await this.waitForExit()) return
    this.child.kill('SIGKILL')
    if (await this.waitForExit()) return
    throw new Error(`native backend for plugin "${this.pluginId}" did not exit after forced termination`)
  }

  stopNow(): void {
    if (!this.stopped) {
      this.stopped = true
      this.terminalError = nativeError('native backend stopped', 'UNAVAILABLE')
      this.rejectPending(this.terminalError)
      this.child.stdin.end()
    }
    if (!this.exitConfirmed) this.child.kill('SIGKILL')
  }

  private request(
    body: MessageInitShape<typeof NativeFrameSchema>['body'],
    label: string,
    responseCase: PendingCall['responseCase'],
    requestId?: number,
  ): Promise<NativeFrame['body']> {
    if (this.stopped) {
      return Promise.reject(this.terminalError ?? nativeError('native backend is unavailable', 'UNAVAILABLE'))
    }
    if (this.pending.size >= MAX_IN_FLIGHT)
      return Promise.reject(nativeError('native backend has too many in-flight calls', 'RESOURCE_EXHAUSTED'))
    const id = requestId ?? this.nextId++
    const payload = toBinary(NativeFrameSchema, create(NativeFrameSchema, { requestId: id, body }))
    if (payload.byteLength === 0 || payload.byteLength > MAX_FRAME_BYTES) {
      return Promise.reject(nativeError('native backend request is too large', 'RESOURCE_EXHAUSTED'))
    }
    const frame = Buffer.allocUnsafe(4 + payload.byteLength)
    frame.writeUInt32LE(payload.byteLength, 0)
    frame.set(payload, 4)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        const error = nativeError(`native backend call "${label}" timed out`, 'DEADLINE_EXCEEDED')
        reject(error)
        this.fail(error)
      }, CALL_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer, responseCase })
      if (this.writeBlocked) {
        if (this.queuedWriteBytes + frame.byteLength > MAX_QUEUED_STDIN_BYTES) {
          clearTimeout(timer)
          this.pending.delete(id)
          reject(nativeError('native backend stdin queue is full', 'RESOURCE_EXHAUSTED'))
          return
        }
        this.queuedWrites.push({ id, frame })
        this.queuedWriteBytes += frame.byteLength
      } else {
        this.writeFrame(id, frame)
      }
    })
  }

  private writeFrame(id: number, frame: Buffer): void {
    this.writeBlocked = !this.child.stdin.write(frame, (error) => {
      if (!error) return
      if (!this.pending.has(id)) return
      this.fail(nativeError(`native backend write failed: ${error.message}`, 'UNAVAILABLE'))
    })
  }

  private flushWrites(): void {
    while (!this.writeBlocked && this.queuedWrites.length > 0 && !this.stopped) {
      const next = this.queuedWrites.shift()
      if (!next) return
      this.queuedWriteBytes -= next.frame.byteLength
      if (!this.pending.has(next.id)) continue
      this.writeFrame(next.id, next.frame)
    }
  }

  private acceptStdout(chunk: Buffer): void {
    if (this.stopped) return
    this.stdoutBuffer = this.stdoutBuffer.length === 0 ? chunk : Buffer.concat([this.stdoutBuffer, chunk])
    for (;;) {
      if (this.stdoutBuffer.length < 4) return
      const length = this.stdoutBuffer.readUInt32LE(0)
      if (length === 0 || length > MAX_FRAME_BYTES) {
        this.fail(nativeError('native backend response is too large', 'UNAVAILABLE'))
        return
      }
      if (this.stdoutBuffer.length < 4 + length) return
      const payload = this.stdoutBuffer.subarray(4, 4 + length)
      this.stdoutBuffer = this.stdoutBuffer.subarray(4 + length)
      this.acceptFrame(payload)
      if (this.stopped) return
    }
  }

  private acceptFrame(payload: Uint8Array): void {
    let response: NativeFrame
    try {
      response = fromBinary(NativeFrameSchema, payload)
    } catch {
      this.fail(nativeError('native backend emitted a malformed Protobuf frame', 'UNAVAILABLE'))
      return
    }
    const pending = this.pending.get(response.requestId)
    if (!pending) {
      this.fail(nativeError(`native backend responded with unknown request id ${response.requestId}`, 'UNAVAILABLE'))
      return
    }
    clearTimeout(pending.timer)
    this.pending.delete(response.requestId)
    const validResponse =
      response.body.case === pending.responseCase ||
      (pending.responseCase === 'callResponse' && response.body.case === 'callError')
    if (!validResponse) {
      const error = nativeError(
        `native backend emitted ${response.body.case || 'an empty body'} for a pending ${pending.responseCase === 'initializeResponse' ? 'initialize' : 'call'} request`,
        'UNAVAILABLE',
      )
      pending.reject(error)
      this.fail(error)
      return
    }
    if (response.body.case === 'callError') {
      pending.reject(
        new NativeCallError(
          response.body.value.message || 'native backend returned an error',
          response.body.value.code,
        ),
      )
      return
    }
    pending.resolve(response.body)
  }

  private fail(error: Error): void {
    if (this.stopped) return
    this.stopped = true
    this.terminalError = toNativeError(error, 'UNAVAILABLE')
    this.rejectPending(this.terminalError)
    if (!this.failureReported) {
      this.failureReported = true
      this.events.failed()
    }
    if (!this.exitConfirmed) this.child.kill('SIGKILL')
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    this.queuedWrites.length = 0
    this.queuedWriteBytes = 0
  }

  private waitForExit(): Promise<boolean> {
    if (this.exitConfirmed) return Promise.resolve(true)
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), STOP_TIMEOUT_MS)
      void this.exited.then(() => {
        clearTimeout(timer)
        resolve(true)
      })
    })
  }

  private reportExit(): void {
    if (this.exitReported) return
    this.exitReported = true
    this.events.exited()
  }
}

export class NativeCallError extends Error {
  readonly name = 'NativeCallError'

  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
  }
}

function nativeError(message: string, code: NativeErrorCode): NativeCallError {
  return new NativeCallError(message, code)
}

function toNativeError(error: unknown, code: NativeErrorCode): NativeCallError {
  if (error instanceof NativeCallError) return error
  return new NativeCallError(error instanceof Error ? error.message : String(error), code)
}

function resolveInstalledBackend(pluginId: string): NativeBackendDescriptor {
  const installed = getInstalledPlugins().find((entry) => entry.manifest.id === pluginId)
  if (!installed) throw nativeError(`plugin "${pluginId}" is not installed`, 'FAILED_PRECONDITION')
  const backend = installed.manifest.nativeBackend
  if (!backend) throw nativeError(`plugin "${pluginId}" does not declare a native backend`, 'FAILED_PRECONDITION')
  const targetName = nativeTargetForHost()
  if (!targetName) {
    throw nativeError(
      `plugin "${pluginId}" has no native backend for ${process.platform}-${process.arch}`,
      'FAILED_PRECONDITION',
    )
  }
  const target = backend.targets[targetName]
  if (!target) throw nativeError(`plugin "${pluginId}" has no native backend for ${targetName}`, 'FAILED_PRECONDITION')
  return { executablePath: join(pluginDir(pluginId), target.file), sha256: target.sha256, service: backend.service }
}

function verifyExecutable(descriptor: NativeBackendDescriptor): void {
  let bytes: Buffer
  try {
    bytes = readFileSync(descriptor.executablePath)
  } catch (error) {
    throw nativeError(`native backend executable cannot be read: ${(error as Error).message}`, 'FAILED_PRECONDITION')
  }
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== descriptor.sha256) {
    throw nativeError(
      `native backend executable checksum mismatch (expected ${descriptor.sha256}, got ${actual})`,
      'FAILED_PRECONDITION',
    )
  }
}

function spawnInstalledBackend(executablePath: string): ChildProcessWithoutNullStreams {
  return spawn(executablePath, [], {
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

export const pluginNativeBackends = new PluginNativeBackendManager()
