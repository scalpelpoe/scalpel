import { createHash } from 'node:crypto'
import { type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginNativeBackendManager } from './native-backend'

interface Request {
  id: number
  method: string
  params: unknown
}

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

  constructor(onRequest: (request: Request, child: FakeChild) => void) {
    super()
    let buffer = ''
    this.stdin.setEncoding('utf8')
    this.stdin.on('data', (chunk: string) => {
      buffer += chunk
      for (;;) {
        const newline = buffer.indexOf('\n')
        if (newline === -1) return
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        onRequest(JSON.parse(line) as Request, this)
      }
    })
    this.stdin.on('finish', () => {
      if (this.exitCode !== null || this.signalCode !== null) return
      this.exitCode = 0
      queueMicrotask(() => this.emit('exit', 0, null))
    })
  }

  respond(id: number, result: unknown): void {
    this.stdout.write(`${JSON.stringify({ id, result })}\n`)
  }

  asChildProcess(): ChildProcessWithoutNullStreams {
    return this as unknown as ChildProcessWithoutNullStreams
  }
}

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function backendFile(bytes = 'native-worker'): { executablePath: string; sha256: string } {
  const dir = mkdtempSync(join(tmpdir(), 'scalpel-native-'))
  tempDirs.push(dir)
  const executablePath = join(dir, 'worker.exe')
  writeFileSync(executablePath, bytes)
  return { executablePath, sha256: createHash('sha256').update(bytes).digest('hex') }
}

describe('PluginNativeBackendManager', () => {
  it('handshakes once and reuses one process for typed request/response calls', async () => {
    const requests: Request[] = []
    const child = new FakeChild((request, process) => {
      requests.push(request)
      if (request.method === 'scalpel.initialize') process.respond(request.id, { protocolVersion: 1 })
      else process.respond(request.id, { echoed: request.params })
    })
    const spawnBackend = vi.fn(() => child.asChildProcess())
    const manager = new PluginNativeBackendManager(() => backendFile(), spawnBackend)

    await expect(manager.call('native-demo', 'analyzeItem', { name: 'Exile' })).resolves.toEqual({
      echoed: { name: 'Exile' },
    })
    await expect(manager.call('native-demo', 'analyzeItem', { name: 'Maven' })).resolves.toEqual({
      echoed: { name: 'Maven' },
    })

    expect(spawnBackend).toHaveBeenCalledOnce()
    expect(requests.map((request) => request.method)).toEqual(['scalpel.initialize', 'analyzeItem', 'analyzeItem'])
    await manager.stop('native-demo')
  })

  it('handles split output chunks and concurrent out-of-order responses', async () => {
    const deferred: Request[] = []
    const child = new FakeChild((request, process) => {
      if (request.method === 'scalpel.initialize') {
        const line = `${JSON.stringify({ id: request.id, result: { protocolVersion: 1 } })}\n`
        process.stdout.write(line.slice(0, 8))
        process.stdout.write(line.slice(8))
      } else {
        deferred.push(request)
        if (deferred.length === 2) {
          process.respond(deferred[1].id, deferred[1].params)
          process.respond(deferred[0].id, deferred[0].params)
        }
      }
    })
    const manager = new PluginNativeBackendManager(
      () => backendFile(),
      () => child.asChildProcess(),
    )

    const first = manager.call('native-demo', 'analyzeItem', { order: 1 })
    const second = manager.call('native-demo', 'analyzeItem', { order: 2 })

    await expect(Promise.all([first, second])).resolves.toEqual([{ order: 1 }, { order: 2 }])
    await manager.stop('native-demo')
  })

  it('rejects pending calls with bounded stderr diagnostics when the process crashes', async () => {
    const child = new FakeChild((request, process) => {
      if (request.method === 'scalpel.initialize') process.respond(request.id, { protocolVersion: 1 })
    })
    const manager = new PluginNativeBackendManager(
      () => backendFile(),
      () => child.asChildProcess(),
    )
    const call = manager.call('native-demo', 'analyzeItem', {})
    await vi.waitFor(() => expect(child.stdin.readableLength).toBeGreaterThanOrEqual(0))
    child.stderr.write('worker panic')
    child.exitCode = 7
    child.emit('exit', 7, null)

    await expect(call).rejects.toThrow(/worker panic/)
  })

  it('verifies executable integrity before spawning', async () => {
    const descriptor = backendFile('tampered')
    descriptor.sha256 = '0'.repeat(64)
    const spawnBackend = vi.fn()
    const manager = new PluginNativeBackendManager(() => descriptor, spawnBackend)

    await expect(manager.call('native-demo', 'analyzeItem', {})).rejects.toThrow(/checksum mismatch/)
    expect(spawnBackend).not.toHaveBeenCalled()
  })

  it('kills a worker that emits malformed protocol output', async () => {
    const child = new FakeChild((request, process) => {
      if (request.method === 'scalpel.initialize') process.respond(request.id, { protocolVersion: 1 })
      else process.stdout.write('not json\n')
    })
    const manager = new PluginNativeBackendManager(
      () => backendFile(),
      () => child.asChildProcess(),
    )

    await expect(manager.call('native-demo', 'analyzeItem', {})).rejects.toThrow(/malformed JSON/)
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('blocks respawn while a plugin lifecycle operation is replacing files', async () => {
    const child = new FakeChild((request, process) => {
      if (request.method === 'scalpel.initialize') process.respond(request.id, { protocolVersion: 1 })
      else process.respond(request.id, request.params)
    })
    const spawnBackend = vi.fn(() => child.asChildProcess())
    const manager = new PluginNativeBackendManager(() => backendFile(), spawnBackend)
    await manager.call('native-demo', 'analyzeItem', {})

    await manager.withPluginStopped('native-demo', async () => {
      await expect(manager.call('native-demo', 'analyzeItem', {})).rejects.toThrow(/temporarily unavailable/)
    })

    expect(spawnBackend).toHaveBeenCalledOnce()
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
})
