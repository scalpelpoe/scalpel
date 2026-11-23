import { beforeEach, describe, expect, it, vi } from 'vitest'

type Done = (error: Error | null) => void
const child = vi.hoisted(() => ({ calls: [] as { args: string[]; done: Done }[] }))

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  execFile: (_file: string, args: string[], _opts: unknown, done: Done) => {
    child.calls.push({ args, done })
  },
}))

const keys = (i: number) => child.calls[i].args.slice(2)

describe('sendKWinKey', () => {
  let sendKWinKey: typeof import('./kwin-input').sendKWinKey
  beforeEach(async () => {
    child.calls = []
    vi.resetModules()
    sendKWinKey = (await import('./kwin-input')).sendKWinKey
  })

  it('runs one ydotool at a time and batches keys queued meanwhile, in order', () => {
    sendKWinKey(29, true)
    sendKWinKey(46, true)
    sendKWinKey(46, false)
    expect(child.calls).toHaveLength(1)
    expect(keys(0)).toEqual(['29:1'])
    child.calls[0].done(null)
    expect(keys(1)).toEqual(['46:1', '46:0'])
  })

  it('retries failed releases ahead of newer keys, but not failed presses', () => {
    sendKWinKey(29, true)
    sendKWinKey(46, true)
    sendKWinKey(29, false)
    child.calls[0].done(null)
    sendKWinKey(30, true)
    child.calls[1].done(new Error('timeout'))
    expect(keys(2)).toEqual(['29:0', '30:1'])
  })

  it('gives up on a release after a few tries', () => {
    sendKWinKey(29, false)
    child.calls[0].done(new Error('down'))
    child.calls[1].done(new Error('down'))
    child.calls[2].done(new Error('down'))
    expect(child.calls).toHaveLength(3)
  })
})
