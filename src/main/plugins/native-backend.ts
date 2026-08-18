import { createHash } from 'node:crypto'
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getInstalledPlugins } from './manager'
import { pluginDir } from './paths'

const MAX_LINE_BYTES = 1024 * 1024
const MAX_IN_FLIGHT = 32
const CALL_TIMEOUT_MS = 10_000
const STOP_TIMEOUT_MS = 750
const MAX_STDERR_BYTES = 8 * 1024
const METHOD_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/

interface NativeBackendDescriptor {
  executablePath: string
  sha256: string
}

interface PendingCall {
  resolve(value: unknown): void
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

  async call<TResult = unknown>(pluginId: string, method: string, params?: unknown): Promise<TResult> {
    if (this.blockAllCount > 0 || (this.blockedPlugins.get(pluginId) ?? 0) > 0) {
      throw new Error(`native backend for plugin "${pluginId}" is temporarily unavailable`)
    }
    if (!METHOD_PATTERN.test(method)) throw new Error('native backend method must be a TypeScript identifier')
    let backend = this.processes.get(pluginId)
    if (!backend) {
      const descriptor = this.resolveBackend(pluginId)
      verifyExecutable(descriptor)
      backend = new NativeBackendProcess(pluginId, this.spawnBackend(descriptor.executablePath), () => {
        if (this.processes.get(pluginId) === backend) this.processes.delete(pluginId)
      })
      this.processes.set(pluginId, backend)
    }
    await backend.ready
    return backend.call(method, params) as Promise<TResult>
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
  private stdoutBuffer = ''
  private stderr = ''
  private stopped = false
  private terminalError: Error | null = null

  constructor(
    private readonly pluginId: string,
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly onExit: () => void,
  ) {
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.acceptStdout(chunk))
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
    this.ready = this.request('scalpel.initialize', { protocolVersion: 1, pluginId }).then((result) => {
      if (!result || typeof result !== 'object' || (result as { protocolVersion?: unknown }).protocolVersion !== 1) {
        throw new Error('native backend returned an invalid protocol handshake')
      }
    })
    this.ready.catch((error) => this.fail(error instanceof Error ? error : new Error(String(error))))
  }

  call(method: string, params?: unknown): Promise<unknown> {
    return this.request(method, params ?? null)
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

  private request(method: string, params: unknown): Promise<unknown> {
    if (this.stopped) return Promise.reject(this.terminalError ?? new Error('native backend is unavailable'))
    if (this.pending.size >= MAX_IN_FLIGHT)
      return Promise.reject(new Error('native backend has too many in-flight calls'))
    const id = this.nextId++
    let line: string
    try {
      line = `${JSON.stringify({ id, method, params })}\n`
    } catch {
      return Promise.reject(new Error('native backend params must be JSON-serializable'))
    }
    if (Buffer.byteLength(line) > MAX_LINE_BYTES)
      return Promise.reject(new Error('native backend request is too large'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`native backend call "${method}" timed out`))
      }, CALL_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(line, 'utf8', (error) => {
        if (!error) return
        const pending = this.pending.get(id)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pending.delete(id)
        pending.reject(new Error(`native backend write failed: ${error.message}`))
      })
    })
  }

  private acceptStdout(chunk: string): void {
    if (this.stopped) return
    this.stdoutBuffer += chunk
    for (;;) {
      const newline = this.stdoutBuffer.indexOf('\n')
      if (newline === -1) {
        if (Buffer.byteLength(this.stdoutBuffer) > MAX_LINE_BYTES) {
          this.fail(new Error('native backend response is too large'))
        }
        return
      }
      const line = this.stdoutBuffer.slice(0, newline).trimEnd()
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1)
      if (!line) continue
      if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
        this.fail(new Error('native backend response is too large'))
        return
      }
      this.acceptLine(line)
      if (this.stopped) return
    }
  }

  private acceptLine(line: string): void {
    let response: unknown
    try {
      response = JSON.parse(line)
    } catch {
      this.fail(new Error('native backend emitted malformed JSON'))
      return
    }
    if (!response || typeof response !== 'object' || !Number.isSafeInteger((response as { id?: unknown }).id)) {
      this.fail(new Error('native backend emitted an invalid response'))
      return
    }
    const value = response as { id: number; result?: unknown; error?: unknown }
    const pending = this.pending.get(value.id)
    if (!pending) {
      this.fail(new Error(`native backend responded with unknown request id ${value.id}`))
      return
    }
    clearTimeout(pending.timer)
    this.pending.delete(value.id)
    if (value.error !== undefined) {
      const message =
        value.error &&
        typeof value.error === 'object' &&
        typeof (value.error as { message?: unknown }).message === 'string'
          ? (value.error as { message: string }).message
          : 'native backend returned an error'
      pending.reject(new Error(message))
      return
    }
    if (!Object.prototype.hasOwnProperty.call(value, 'result')) {
      pending.reject(new Error('native backend response has neither result nor error'))
      return
    }
    pending.resolve(value.result)
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
  return { executablePath: join(pluginDir(pluginId), target.file), sha256: target.sha256 }
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
