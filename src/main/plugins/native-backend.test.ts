import { createHash } from 'node:crypto'
import { type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeFrameSchema, type NativeFrame } from './generated/scalpel/plugin/native/v1/transport_pb'
import { NativeCallError, PluginNativeBackendManager } from './native-backend'

const SERVICE = 'example.v1.NativeDemo'
const METHOD = `/${SERVICE}/AnalyzeItem`

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  readonly kill = vi.fn(() => {
    if (this.exitCode !== null || this.signalCode !== null) return false
    this.signalCode = 'SIGTERM'
    queueMicrotask(() => this.emit('exit', null, this.signalCode))
    return true
  })

  constructor(onRequest: (request: NativeFrame, child: FakeChild) => void) {
    super()
    let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
    this.stdin.on('data', (chunk: Buffer) => {
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk])
      for (;;) {
        if (buffer.length < 4) return
        const length = buffer.readUInt32LE(0)
        if (buffer.length < length + 4) return
        const frame = fromBinary(NativeFrameSchema, buffer.subarray(4, length + 4))
        buffer = buffer.subarray(length + 4)
        onRequest(frame, this)
      }
    })
    this.stdin.on('finish', () => {
      if (this.exitCode !== null || this.signalCode !== null) return
      this.exitCode = 0
      queueMicrotask(() => this.emit('exit', 0, null))
    })
  }

  forceBackpressure(): void {
    const original = this.stdin.write.bind(this.stdin) as (
      chunk: Uint8Array,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ) => boolean
    this.stdin.write = ((
      chunk: Uint8Array,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ) => {
      original(chunk, encodingOrCallback, callback)
      return false
    }) as typeof this.stdin.write
  }

  initialize(request: NativeFrame): void {
    this.respond(
      create(NativeFrameSchema, {
        requestId: request.requestId,
        body: {
          case: 'initializeResponse',
          value: { protocolVersion: 1, pluginId: 'native-demo', service: SERVICE },
        },
      }),
    )
  }

  callResult(request: NativeFrame, payload: Uint8Array): void {
    this.respond(
      create(NativeFrameSchema, {
        requestId: request.requestId,
        body: { case: 'callResponse', value: { payload } },
      }),
    )
  }

  callError(request: NativeFrame, code: string, message: string): void {
    this.respond(
      create(NativeFrameSchema, {
        requestId: request.requestId,
        body: { case: 'callError', value: { code, message } },
      }),
    )
  }

  respond(frame: NativeFrame, splitAt?: number): void {
    const payload = toBinary(NativeFrameSchema, frame)
    const bytes = Buffer.allocUnsafe(payload.length + 4)
    bytes.writeUInt32LE(payload.length, 0)
    bytes.set(payload, 4)
    if (splitAt === undefined) this.stdout.write(bytes)
    else {
      this.stdout.write(bytes.subarray(0, splitAt))
      this.stdout.write(bytes.subarray(splitAt))
    }
  }

  asChildProcess(): ChildProcessWithoutNullStreams {
    return this as unknown as ChildProcessWithoutNullStreams
  }
}

const tempDirs: string[] = []

afterEach(() => {
  vi.useRealTimers()
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function backendFile(bytes = 'native-worker'): { executablePath: string; sha256: string; service: string } {
  const dir = mkdtempSync(join(tmpdir(), 'scalpel-native-'))
  tempDirs.push(dir)
  const executablePath = join(dir, 'worker.exe')
  writeFileSync(executablePath, bytes)
  return { executablePath, sha256: createHash('sha256').update(bytes).digest('hex'), service: SERVICE }
}

describe('PluginNativeBackendManager', () => {
  it('handshakes once and reuses one process for binary calls', async () => {
    const requests: NativeFrame[] = []
    const child = new FakeChild((request, process) => {
      requests.push(request)
      if (request.body.case === 'initializeRequest') process.initialize(request)
      else if (request.body.case === 'callRequest') process.callResult(request, request.body.value.payload)
    })
    const spawnBackend = vi.fn(() => child.asChildProcess())
    const manager = new PluginNativeBackendManager(() => backendFile(), spawnBackend)

    await expect(manager.call('native-demo', METHOD, Uint8Array.of(1, 2))).resolves.toEqual(Uint8Array.of(1, 2))
    await expect(manager.call('native-demo', METHOD, Uint8Array.of(3, 4))).resolves.toEqual(Uint8Array.of(3, 4))

    expect(spawnBackend).toHaveBeenCalledOnce()
    expect(requests.map((request) => request.body.case)).toEqual(['initializeRequest', 'callRequest', 'callRequest'])
    await manager.stop('native-demo')
  })

  it('handles split frames and concurrent out-of-order responses', async () => {
    const deferred: Array<NativeFrame & { body: Extract<NativeFrame['body'], { case: 'callRequest' }> }> = []
    const child = new FakeChild((request, process) => {
      if (request.body.case === 'initializeRequest') {
        const response = create(NativeFrameSchema, {
          requestId: request.requestId,
          body: {
            case: 'initializeResponse',
            value: { protocolVersion: 1, pluginId: 'native-demo', service: SERVICE },
          },
        })
        process.respond(response, 3)
      } else if (request.body.case === 'callRequest') {
        deferred.push(request as NativeFrame & { body: Extract<NativeFrame['body'], { case: 'callRequest' }> })
        if (deferred.length === 2) {
          process.callResult(deferred[1], deferred[1].body.value.payload)
          process.callResult(deferred[0], deferred[0].body.value.payload)
        }
      }
    })
    const manager = new PluginNativeBackendManager(
      () => backendFile(),
      () => child.asChildProcess(),
    )

    const first = manager.call('native-demo', METHOD, Uint8Array.of(1))
    const second = manager.call('native-demo', METHOD, Uint8Array.of(2))

    await expect(Promise.all([first, second])).resolves.toEqual([Uint8Array.of(1), Uint8Array.of(2)])
    await manager.stop('native-demo')
  })

  it('rejects calls when the worker closes stdin without exiting', async () => {
    const requests: NativeFrame[] = []
    const child = new FakeChild((request, process) => {
      requests.push(request)
      if (request.body.case === 'initializeRequest') process.initialize(request)
    })
    const manager = new PluginNativeBackendManager(
      () => backendFile(),
      () => child.asChildProcess(),
    )

    const call = manager.call('native-demo', METHOD, Uint8Array.of(1))
    await vi.waitFor(() => expect(requests.some((request) => request.body.case === 'callRequest')).toBe(true))
    child.stdin.emit('error', new Error('EPIPE'))

    await expect(call).rejects.toThrow(/stdin failed: EPIPE/)
  })

  it('rejects pending calls with bounded stderr diagnostics when the process crashes', async () => {
    const child = new FakeChild((request, process) => {
      if (request.body.case === 'initializeRequest') process.initialize(request)
    })
    const manager = new PluginNativeBackendManager(
      () => backendFile(),
      () => child.asChildProcess(),
    )
    const call = manager.call('native-demo', METHOD, new Uint8Array())
    await vi.waitFor(() => expect(child.stdin.readableLength).toBeGreaterThanOrEqual(0))
    child.stderr.write('worker panic')
    child.exitCode = 7
    child.emit('exit', 7, null)

    await expect(call).rejects.toThrow(/worker panic/)
  })

  it('kills and evicts a worker when a call times out', async () => {
    vi.useFakeTimers()
    const child = new FakeChild((request, process) => {
      if (request.body.case === 'initializeRequest') process.initialize(request)
    })
    const manager = new PluginNativeBackendManager(
      () => backendFile(),
      () => child.asChildProcess(),
    )

    const call = manager.call('native-demo', METHOD, new Uint8Array())
    const rejection = expect(call).rejects.toThrow(/timed out/)
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(10_000)

    await rejection
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('verifies executable integrity before spawning', async () => {
    const descriptor = backendFile('tampered')
    descriptor.sha256 = '0'.repeat(64)
    const spawnBackend = vi.fn()
    const manager = new PluginNativeBackendManager(() => descriptor, spawnBackend)

    await expect(manager.call('native-demo', METHOD, new Uint8Array())).rejects.toThrow(/checksum mismatch/)
    expect(spawnBackend).not.toHaveBeenCalled()
  })

  it('kills a worker that emits malformed Protobuf output', async () => {
    const child = new FakeChild((request, process) => {
      if (request.body.case === 'initializeRequest') process.initialize(request)
      else process.stdout.write(Buffer.from([1, 0, 0, 0, 0xff]))
    })
    const manager = new PluginNativeBackendManager(
      () => backendFile(),
      () => child.asChildProcess(),
    )

    await expect(manager.call('native-demo', METHOD, new Uint8Array())).rejects.toThrow(/malformed Protobuf/)
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('blocks respawn while a plugin lifecycle operation is replacing files', async () => {
    const child = new FakeChild((request, process) => {
      if (request.body.case === 'initializeRequest') process.initialize(request)
      else if (request.body.case === 'callRequest') process.callResult(request, request.body.value.payload)
    })
    const spawnBackend = vi.fn(() => child.asChildProcess())
    const manager = new PluginNativeBackendManager(() => backendFile(), spawnBackend)
    await manager.call('native-demo', METHOD, new Uint8Array())

    await manager.withPluginStopped('native-demo', async () => {
      await expect(manager.call('native-demo', METHOD, new Uint8Array())).rejects.toThrow(/temporarily unavailable/)
    })

    expect(spawnBackend).toHaveBeenCalledOnce()
  })

  it('keeps a successfully mutated plugin blocked until restart and unblocks failure', async () => {
    const child = new FakeChild((request, process) => {
      if (request.body.case === 'initializeRequest') process.initialize(request)
      else if (request.body.case === 'callRequest') process.callResult(request, request.body.value.payload)
    })
    const manager = new PluginNativeBackendManager(
      () => backendFile(),
      () => child.asChildProcess(),
    )

    await manager.withPluginStoppedUntilRestart(
      'native-demo',
      () => ({ ok: false }),
      (result) => result.ok,
    )
    await expect(manager.call('native-demo', METHOD, new Uint8Array())).resolves.toEqual(new Uint8Array())
    await manager.withPluginStoppedUntilRestart(
      'native-demo',
      () => ({ ok: true }),
      (result) => result.ok,
    )

    expect(manager.isRestartRequired()).toBe(true)
    expect([...manager.restartBlockedPluginIds()]).toEqual(['native-demo'])
    await expect(manager.call('native-demo', METHOD, new Uint8Array())).rejects.toThrow(/temporarily unavailable/)
  })

  it('preserves the typed native CallError code', async () => {
    const child = new FakeChild((request, process) => {
      if (request.body.case === 'initializeRequest') process.initialize(request)
      else process.callError(request, 'INVALID_ITEM', 'item payload is invalid')
    })
    const manager = new PluginNativeBackendManager(
      () => backendFile(),
      () => child.asChildProcess(),
    )

    const error = await manager.call('native-demo', METHOD, new Uint8Array()).catch((caught) => caught)
    expect(error).toBeInstanceOf(NativeCallError)
    expect(error).toMatchObject({ code: 'INVALID_ITEM', message: 'item payload is invalid' })
    await manager.stop('native-demo')
  })

  it('bounds frames queued while native stdin is backpressured', async () => {
    const child = new FakeChild((request, process) => {
      if (request.body.case === 'initializeRequest') process.initialize(request)
    })
    child.forceBackpressure()
    const manager = new PluginNativeBackendManager(
      () => backendFile(),
      () => child.asChildProcess(),
    )

    const calls = Array.from({ length: 7 }, () => manager.call('native-demo', METHOD, new Uint8Array(700_000)))
    await expect(Promise.all(calls)).rejects.toThrow(/stdin queue is full/)
    await manager.stop('native-demo')
  })

  it('serializes competing lifecycle operations', async () => {
    const manager = new PluginNativeBackendManager(() => backendFile(), vi.fn())
    const events: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const first = manager.withPluginStopped('native-demo', async () => {
      events.push('first-start')
      await firstGate
      events.push('first-end')
    })
    const second = manager.withPluginStopped('native-demo', () => {
      events.push('second')
    })
    await vi.waitFor(() => expect(events).toEqual(['first-start']))

    releaseFirst()
    await Promise.all([first, second])

    expect(events).toEqual(['first-start', 'first-end', 'second'])
  })

  it('blocks all worker respawns during graceful shutdown', async () => {
    const manager = new PluginNativeBackendManager(() => backendFile(), vi.fn())

    await manager.shutdown()

    await expect(manager.call('native-demo', METHOD, new Uint8Array())).rejects.toThrow(/temporarily unavailable/)
  })
})
