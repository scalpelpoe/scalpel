// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { StreamOverview } from '@shared/contracts/stream'
import { DEFAULT_STREAM_SETTINGS } from '@shared/contracts/stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StreamSection } from './StreamSection'

function overview(patch: Partial<StreamOverview> = {}): StreamOverview {
  return {
    settings: { ...DEFAULT_STREAM_SETTINGS },
    publisher: {
      phase: 'off',
      character: null,
      lastPushUtc: null,
      sourceUpdatedUtc: null,
      version: null,
      error: null,
      warnings: [],
      patchedSlots: [],
    },
    profile: null,
    profileError: null,
    publicUrl: null,
    obsUrl: null,
    ...patch,
  }
}

const enabled = (patch: Partial<StreamOverview> = {}): StreamOverview =>
  overview({
    settings: { ...DEFAULT_STREAM_SETTINGS, enabled: true, profileId: 'p1', poeAccount: 'aer0__' },
    profile: {
      profileId: 'p1',
      state: 'live',
      hideCharacterName: false,
      slug: null,
      twitch: null,
      head: null,
    },
    ...patch,
  })

let api: Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  api = {
    streamGetOverview: vi.fn(async () => overview()),
    onStreamOverview: vi.fn(() => () => {}),
    streamEnable: vi.fn(async () => enabled()),
    streamDisable: vi.fn(async () => overview()),
    streamListCharacters: vi.fn(async () => [
      { account: 'aer0_-2690', name: 'GassiusClay', league: 'Forbidden Rites', level: 95 },
    ]),
    streamPairingCode: vi.fn(async () => ({ code: 'AB3D5F7H', expiresUtc: '2026-09-29T12:10:00Z' })),
    streamUpdateSettings: vi.fn(async () => enabled()),
    streamSetState: vi.fn(async () => enabled()),
    streamPushNow: vi.fn(async () => enabled()),
    streamDeleteProfile: vi.fn(async () => overview()),
  }
  ;(window as unknown as { api: typeof api }).api = api
})

describe('StreamSection', () => {
  it('shows one toggle and the explanation while off', async () => {
    render(<StreamSection />)
    await screen.findByText(/Share my PoE2 gear/)
    expect(screen.getByText(/Gear comes from your account's poe\.ninja profile/)).toBeInTheDocument()
    expect(screen.queryByText('Path of Exile account')).toBeNull()
  })

  it('enables and then offers pairing', async () => {
    render(<StreamSection />)
    fireEvent.click(await screen.findByText(/Share my PoE2 gear/))
    await waitFor(() => expect(api.streamEnable).toHaveBeenCalled())
    await screen.findByText('Path of Exile account')
    fireEvent.click(screen.getByText('Get pairing code'))
    await screen.findByText('AB3D5F7H')
    expect(screen.getByText(/enter this code/)).toBeInTheDocument()
  })

  it('shows the linked channel and copyable links once paired', async () => {
    api.streamGetOverview.mockResolvedValue(
      enabled({
        profile: {
          profileId: 'p1',
          state: 'live',
          hideCharacterName: false,
          slug: 'aer0__',
          twitch: { channelId: '123', login: 'aer0__' },
          head: { version: 3, publishedUtc: '2026-09-29T12:00:00Z' },
        },
        publicUrl: 'https://live.scalpel.fourth.party/aer0__',
        obsUrl: 'https://live.scalpel.fourth.party/aer0__/obs',
      }),
    )
    render(<StreamSection />)
    await screen.findByText('Linked to aer0__')
    expect(screen.queryByText('Get pairing code')).toBeNull()
    // Each link has its own title above its box, which holds just the URL.
    expect(screen.getByText('Public page link')).toBeInTheDocument()
    expect(screen.getByText('https://live.scalpel.fourth.party/aer0__')).toBeInTheDocument()
    expect(screen.getByText('OBS browser source link')).toBeInTheDocument()
    expect(screen.getByText('https://live.scalpel.fourth.party/aer0__/obs')).toBeInTheDocument()
    expect(screen.queryByText('Links')).toBeNull()
  })

  it('saves the Path of Exile account on blur and lists characters to pin', async () => {
    api.streamGetOverview.mockResolvedValue(enabled())
    render(<StreamSection />)
    const input = (await screen.findByPlaceholderText('Name#1234')) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://poe.ninja/poe2/profile/Other-1234' } })
    fireEvent.blur(input)
    await waitFor(() =>
      expect(api.streamUpdateSettings).toHaveBeenCalledWith({
        poeAccount: 'https://poe.ninja/poe2/profile/Other-1234',
      }),
    )
    await waitFor(() => expect(api.streamListCharacters).toHaveBeenCalled())
  })

  it('saves once on Enter and shows the normalized account', async () => {
    api.streamGetOverview.mockResolvedValue(enabled())
    api.streamUpdateSettings.mockResolvedValue(
      enabled({ settings: { ...DEFAULT_STREAM_SETTINGS, enabled: true, profileId: 'p1', poeAccount: 'Other#1234' } }),
    )
    render(<StreamSection />)
    const input = (await screen.findByPlaceholderText('Name#1234')) as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'https://poe.ninja/poe2/profile/Other-1234' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(input.value).toBe('Other#1234'))
    fireEvent.blur(input)
    expect(api.streamUpdateSettings).toHaveBeenCalledTimes(1)
  })

  it('offers the filters link toggle only once there is an account', async () => {
    api.streamGetOverview.mockResolvedValue(
      enabled({ settings: { ...DEFAULT_STREAM_SETTINGS, enabled: true, profileId: 'p1', poeAccount: '' } }),
    )
    const { unmount } = render(<StreamSection />)
    await screen.findByText('Build guide link')
    expect(screen.queryByText('Link my item filters')).toBeNull()
    unmount()

    api.streamGetOverview.mockResolvedValue(enabled())
    render(<StreamSection />)
    // The box under the heading is the click target.
    fireEvent.click((await screen.findByText('Link my item filters')).nextElementSibling as Element)
    await waitFor(() => expect(api.streamUpdateSettings).toHaveBeenCalledWith({ linkItemFilters: false }))
  })

  it('saves the build guide link on blur and keeps the draft when main refuses it', async () => {
    api.streamGetOverview.mockResolvedValue(enabled())
    api.streamUpdateSettings.mockRejectedValueOnce(
      new Error("my build isn't a web address. Paste the guide's full link."),
    )
    render(<StreamSection />)
    const input = (await screen.findByPlaceholderText('YouTube video or guide URL')) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'my build' } })
    fireEvent.blur(input)
    await screen.findByText(/isn't a web address/)
    expect(input.value).toBe('my build')
    expect(api.streamUpdateSettings).toHaveBeenCalledWith({ buildGuideUrl: 'my build' })
  })

  it('picks up a broadcast account when the user has not edited the field', async () => {
    api.streamGetOverview.mockResolvedValue(enabled())
    render(<StreamSection />)
    await screen.findByPlaceholderText('Name#1234')
    const [broadcast] = api.onStreamOverview.mock.calls[0]
    act(() => {
      broadcast(
        enabled({ settings: { ...DEFAULT_STREAM_SETTINGS, enabled: true, profileId: 'p1', poeAccount: 'Auto#5678' } }),
      )
    })
    await waitFor(() => expect((screen.getByPlaceholderText('Name#1234') as HTMLInputElement).value).toBe('Auto#5678'))
  })

  it('surfaces publisher problems and pushes on demand', async () => {
    api.streamGetOverview.mockResolvedValue(
      enabled({
        publisher: {
          phase: 'error',
          character: null,
          lastPushUtc: null,
          sourceUpdatedUtc: null,
          version: null,
          error: 'poe.ninja unreachable',
          warnings: [],
          patchedSlots: [],
        },
      }),
    )
    render(<StreamSection />)
    await screen.findByText(/Problem: poe.ninja unreachable/)
    fireEvent.click(screen.getByText('Push now'))
    await waitFor(() => expect(api.streamPushNow).toHaveBeenCalled())
  })

  it('asks twice before removing the stream profile', async () => {
    api.streamGetOverview.mockResolvedValue(enabled())
    render(<StreamSection />)
    fireEvent.click(await screen.findByText('Remove my Scalpel Stream data'))
    expect(api.streamDeleteProfile).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText(/Click again to remove/))
    await waitFor(() => expect(api.streamDeleteProfile).toHaveBeenCalled())
  })

  it('shows IPC errors without the Electron prefix', async () => {
    api.streamEnable.mockRejectedValue(
      new Error("Error invoking remote method 'stream:enable': Error: Scalpel Stream unreachable"),
    )
    render(<StreamSection />)
    fireEvent.click(await screen.findByText(/Share my PoE2 gear/))
    await screen.findByText('Scalpel Stream unreachable')
  })
})
