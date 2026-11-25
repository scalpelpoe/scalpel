import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  diagnostic: vi.fn(),
}))

vi.mock('node:child_process', () => ({ execFileSync: mocks.execFileSync }))
vi.mock('../diagnostics', () => ({ reportLinuxDiagnostic: mocks.diagnostic }))

type WaylandClipboard = typeof import('./clipboard')

let mod: WaylandClipboard

function availableTools(result: string | Buffer = 'ok'): void {
  mocks.execFileSync.mockImplementation((tool: string, args: string[]) => {
    if (args[0] === '--version') return `${tool} 1.0`
    return result
  })
}

beforeEach(async () => {
  vi.resetModules()
  mocks.execFileSync.mockReset()
  mocks.diagnostic.mockReset()
  mod = await import('./clipboard')
})

describe('Wayland clipboard', () => {
  it('reads plain text with no trailing newline', () => {
    availableTools('hello')
    expect(mod.readWaylandText()).toBe('hello')
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      'wl-paste',
      ['--no-newline'],
      expect.objectContaining({ encoding: 'utf8' }),
    )
  })

  it('writes text through wl-copy stdin', () => {
    availableTools()
    expect(mod.writeWaylandText('chat command')).toBe(true)
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      'wl-copy',
      [],
      expect.objectContaining({ input: 'chat command', stdio: ['pipe', 'ignore', 'ignore'] }),
    )
  })

  it('clears the selection', () => {
    availableTools()
    expect(mod.clearWaylandClipboard()).toBe(true)
    expect(mocks.execFileSync).toHaveBeenCalledWith('wl-copy', ['--clear'], expect.anything())
  })

  it('reads uri-list and HTML with explicit MIME types', () => {
    availableTools('payload')
    expect(mod.readWaylandUriList()).toBe('payload')
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      'wl-paste',
      ['--no-newline', '--type', 'text/uri-list'],
      expect.anything(),
    )
    expect(mod.readWaylandHtml()).toBe('payload')
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      'wl-paste',
      ['--no-newline', '--type', 'text/html'],
      expect.anything(),
    )
  })

  it('turns an offered image into a data URL', () => {
    mocks.execFileSync.mockImplementation((_tool: string, args: string[]) => {
      if (args[0] === '--version') return 'wl-clipboard 1.0'
      if (args[0] === '--list-types') return 'text/plain\nimage/png\n'
      return Buffer.from('PNG')
    })
    expect(mod.readWaylandImageDataUrl()).toBe('data:image/png;base64,UE5H')
  })

  it('returns an empty string when the selection is empty', () => {
    mocks.execFileSync.mockImplementation((_tool: string, args: string[]) => {
      if (args[0] === '--version') return 'wl-clipboard 1.0'
      throw Object.assign(new Error('empty selection'), { status: 1 })
    })
    expect(mod.readWaylandText()).toBe('')
  })

  it('uses a longer timeout and treats a hung owner as an empty selection', () => {
    mocks.execFileSync.mockImplementation((_tool: string, args: string[]) => {
      if (args[0] === '--version') return 'wl-clipboard 1.0'
      throw Object.assign(new Error('spawnSync wl-paste ETIMEDOUT'), { code: 'ETIMEDOUT', killed: true })
    })
    expect(mod.readWaylandText()).toBe('')
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      'wl-paste',
      ['--no-newline'],
      expect.objectContaining({ timeout: 5_000 }),
    )
    expect(mocks.diagnostic).toHaveBeenCalledWith('wayland-clipboard:read-timeout', expect.any(Error))
  })

  it('returns null when the tools are unavailable', () => {
    mocks.execFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    expect(mod.readWaylandText()).toBeNull()
    expect(mod.writeWaylandText('text')).toBe(false)
  })
})
