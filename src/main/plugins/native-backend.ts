import { createHash } from 'node:crypto'
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { create, fromBinary, toBinary, type MessageInitShape } from '@bufbuild/protobuf'
import { NativeFrameSchema, type NativeFrame } from './generated/scalpel/plugin/native/v1/transport_pb'
import { getInstalledPlugins } from './manager'
import { pluginDir } from './paths'

const MAX_FRAME_BYTES = 1024 * 1024
const MAX_IN_FLIGHT = 32
const CALL_TIMEOUT_MS = 10_000
const STOP_TIMEOUT_MS = 750
const MAX_STDERR_BYTES = 8 * 1024
const METHOD_PATTERN = /^\/[A-Za-z_][A-Za-z0-9_.]*\/[A-Za-z_][A-Za-z0-9_]*$/

interface NativeBackendDescriptor {
  executablePath: string
  sha256: string
  service: string
}

interface PendingCall {
  resolve(value: NativeFrame['body']): void
  reject(error: Error): void
  timer: NodeJS.Timeout
}

type SpawnBackend = (executablePath: string) => ChildProcessWithoutNullStreams
type ResolveBackend = (pluginId: string) => NativeBackendDescriptor

export class PluginNativeBackendManager {
  private readonly processes = new Map<string, NativeBackendProcess>()
  private readonly blockedPlugins = new Map<string, number>()
  private blockAllCount = 0
  private lifecycleTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly resolveBackend: ResolveBackend = resolveInstalledBackend,
    private readonly spawnBackend: SpawnBackend = spawnInstalledBackend,
  ) {}

  async call(pluginId: string, method: string, payload: Uint8Array): Promise<Uint8Array> {
    if (this.blockAllCount > 0 || (this.blockedPlugins.get(pluginId) ?? 0) > 0) {
      throw new Error(`native backend for plugin "${pluginId}" is temporarily unavailable`)
    }
    if (!METHOD_PATTERN.test(method)) throw new Error('native backend method must be a fully qualified Protobuf method')
    if (!(payload instanceof Uint8Array)) throw new Error('native backend payload must be a Uint8Array')
    let backend = this.processes.get(pluginId)
    if (!backend) {
      const descriptor = this.resolveBackend(pluginId)
      verifyExecutable(descriptor)
      backend = new NativeBackendProcess(
        pluginId,
        descriptor.service,
        this.spawnBackend(descriptor.executablePath),
        () => {
          if (this.processes.get(pluginId) === backend) this.processes.delete(pluginId)
        },
      )
      this.processes.set(pluginId, backend)
    }
    await backend.ready
    return backend.call(method, Uint8Array.from(payload))
  }

  async stop(pluginId: string): Promise<void> {
    const backend = this.processes.get(pluginId)
    if (!backend) return
    this.processes.delete(pluginId)
    await backend.stop()
  }

  async stopAll(): Promise<void> {
    const backends = [...this.processes.values()]
    this.processes.clear()
    await Promise.all(backends.map((backend) => backend.stop()))
  }

  async withPluginStopped<TResult>(pluginId: string, operation: () => TResult | Promise<TResult>): Promise<TResult> {
    return this.serializeLifecycle(async () => {
      this.blockedPlugins.set(pluginId, (this.blockedPlugins.get(pluginId) ?? 0) + 1)
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

  async withAllStopped<TResult>(operation: () => TResult | Promise<TResult>): Promise<TResult> {
    return this.serializeLifecycle(async () => {
      this.blockAllCount += 1
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
  private terminalError: Error | null = null

  constructor(
    private readonly pluginId: string,
    private readonly service: string,
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly onExit: () => void,
  ) {
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: Buffer) => this.acceptStdout(chunk))
    child.stderr.on('data', (chunk: string) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-MAX_STDERR_BYTES)
    })
    child.once('error', (error) => this.fail(new Error(`native backend failed to start: ${error.message}`)))
    child.once('exit', (code, signal) => {
      if (this.stopped) return this.finish()
      const detail = this.stderr.trim()
      this.fail(
        new Error(
          `native backend exited (${signal ? `signal ${signal}` : `code ${String(code)}`})${detail ? `: ${detail}` : ''}`,
        ),
      )
    })
    this.ready = this.request(
      {
        case: 'initializeRequest',
        value: { protocolVersion: 1, pluginId, service },
      },
      'initialize',
      0,
    ).then((body) => {
      if (
        body.case !== 'initializeResponse' ||
        body.value.protocolVersion !== 1 ||
        body.value.pluginId !== pluginId ||
        body.value.service !== service
      ) {
        throw new Error('native backend returned an invalid protocol handshake')
      }
    })
    this.ready.catch((error) => this.fail(error instanceof Error ? error : new Error(String(error))))
  }

  async call(method: string, payload: Uint8Array): Promise<Uint8Array> {
    if (!method.startsWith(`/${this.service}/`)) {
      throw new Error(`native backend method must belong to service "${this.service}"`)
    }
    const body = await this.request({ case: 'callRequest', value: { method, payload } }, method)
    if (body.case !== 'callResponse') throw new Error('native backend returned an invalid call response')
    return Uint8Array.from(body.value.payload)
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.terminalError = new Error('native backend stopped')
    this.rejectPending(this.terminalError)
    const exited = new Promise<void>((resolve) => this.child.once('exit', () => resolve()))
    this.child.stdin.end()
    const graceful = await Promise.race([
      exited.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), STOP_TIMEOUT_MS)),
    ])
    if (!graceful && this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill()
      await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS))])
    }
    this.finish()
  }

  stopNow(): void {
    if (this.stopped) return
    this.stopped = true
    this.terminalError = new Error('native backend stopped')
    this.rejectPending(this.terminalError)
    this.child.stdin.end()
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill()
    this.finish()
  }

  private request(
    body: MessageInitShape<typeof NativeFrameSchema>['body'],
    label: string,
    requestId?: number,
  ): Promise<NativeFrame['body']> {
    if (this.stopped) return Promise.reject(this.terminalError ?? new Error('native backend is unavailable'))
    if (this.pending.size >= MAX_IN_FLIGHT)
      return Promise.reject(new Error('native backend has too many in-flight calls'))
    const id = requestId ?? this.nextId++
    const payload = toBinary(NativeFrameSchema, create(NativeFrameSchema, { requestId: id, body }))
    if (payload.byteLength === 0 || payload.byteLength > MAX_FRAME_BYTES) {
      return Promise.reject(new Error('native backend request is too large'))
    }
    const frame = Buffer.allocUnsafe(4 + payload.byteLength)
    frame.writeUInt32LE(payload.byteLength, 0)
    frame.set(payload, 4)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        const error = new Error(`native backend call "${label}" timed out`)
        reject(error)
        this.fail(error)
      }, CALL_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(frame, (error) => {
        if (!error) return
        const pending = this.pending.get(id)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pending.delete(id)
        pending.reject(new Error(`native backend write failed: ${error.message}`))
      })
    })
  }

  private acceptStdout(chunk: Buffer): void {
    if (this.stopped) return
    this.stdoutBuffer = this.stdoutBuffer.length === 0 ? chunk : Buffer.concat([this.stdoutBuffer, chunk])
    for (;;) {
      if (this.stdoutBuffer.length < 4) return
      const length = this.stdoutBuffer.readUInt32LE(0)
      if (length === 0 || length > MAX_FRAME_BYTES) {
        this.fail(new Error('native backend response is too large'))
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
      this.fail(new Error('native backend emitted a malformed Protobuf frame'))
      return
    }
    const pending = this.pending.get(response.requestId)
    if (!pending) {
      this.fail(new Error(`native backend responded with unknown request id ${response.requestId}`))
      return
    }
    clearTimeout(pending.timer)
    this.pending.delete(response.requestId)
    if (response.body.case === 'callError') {
      pending.reject(new Error(response.body.value.message || 'native backend returned an error'))
      return
    }
    if (response.body.case !== 'callResponse' && response.body.case !== 'initializeResponse') {
      const error = new Error('native backend emitted an invalid response body')
      pending.reject(error)
      this.fail(error)
      return
    }
    pending.resolve(response.body)
  }

  private fail(error: Error): void {
    if (this.stopped) return
    this.stopped = true
    this.terminalError = error
    this.rejectPending(error)
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill()
    this.finish()
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private finish(): void {
    this.onExit()
  }
}

function resolveInstalledBackend(pluginId: string): NativeBackendDescriptor {
  const installed = getInstalledPlugins().find((entry) => entry.manifest.id === pluginId)
  if (!installed) throw new Error(`plugin "${pluginId}" is not installed`)
  const backend = installed.manifest.nativeBackend
  if (!backend) throw new Error(`plugin "${pluginId}" does not declare a native backend`)
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(`plugin "${pluginId}" has no native backend for ${process.platform}-${process.arch}`)
  }
  const target = backend.targets['win32-x64']
  if (!target) throw new Error(`plugin "${pluginId}" has no native backend for win32-x64`)
  return { executablePath: join(pluginDir(pluginId), target.file), sha256: target.sha256, service: backend.service }
}

function verifyExecutable(descriptor: NativeBackendDescriptor): void {
  let bytes: Buffer
  try {
    bytes = readFileSync(descriptor.executablePath)
  } catch (error) {
    throw new Error(`native backend executable cannot be read: ${(error as Error).message}`)
  }
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== descriptor.sha256) {
    throw new Error(`native backend executable checksum mismatch (expected ${descriptor.sha256}, got ${actual})`)
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
