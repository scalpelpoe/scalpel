// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fakeTwitch, jsonResponse } from '../test-helpers'
import { ConfigPage, normalizeCode } from './ConfigPage'

const linkedStatus = {
  profileId: 'p1',
  state: 'live',
  hideCharacterName: false,
  slug: 'aer0__',
  twitch: { channelId: '123', login: 'aer0__' },
  head: null,
}

describe('normalizeCode', () => {
  it('uppercases and drops separators and look-alikes', () => {
    expect(normalizeCode('ab3d-5f7h')).toBe('AB3D5F7H')
    expect(normalizeCode('AB 3D 5F 7H 99')).toBe('AB3D5F7H')
    expect(normalizeCode('0O1IL')).toBe('')
  })
})

describe('ConfigPage', () => {
  it('claims the code with the broadcaster token', async () => {
    const twitch = fakeTwitch()
    const fetcher = vi.fn(async () => jsonResponse(linkedStatus))
    render(<ConfigPage ext={twitch.ext} fetcher={fetcher} />)
    act(() => twitch.authorize())
    fireEvent.change(screen.getByLabelText('Pairing code'), { target: { value: 'ab3d-5f7h' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link channel' }))
    expect(await screen.findByText(/Linked as aer0__/)).toBeInTheDocument()
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/v1\/twitch\/claim$/)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jwt' })
    expect(JSON.parse(String(init.body))).toEqual({ code: 'AB3D5F7H' })
  })

  it('explains expired codes and taken channels', async () => {
    const twitch = fakeTwitch()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404))
      .mockResolvedValueOnce(jsonResponse({ error: 'taken' }, 409))
    render(<ConfigPage ext={twitch.ext} fetcher={fetcher} />)
    act(() => twitch.authorize())
    fireEvent.change(screen.getByLabelText('Pairing code'), { target: { value: 'AB3D5F7H' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link channel' }))
    expect(await screen.findByText(/expired/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Link channel' }))
    expect(await screen.findByText(/already linked/)).toBeInTheDocument()
  })

  it('waits for Twitch authorization and a full code', () => {
    render(<ConfigPage ext={fakeTwitch().ext} fetcher={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Pairing code'), { target: { value: 'AB3D5F7H' } })
    expect(screen.getByRole('button', { name: 'Link channel' })).toBeDisabled()
  })

  it('unlinks the channel', async () => {
    const twitch = fakeTwitch()
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    render(<ConfigPage ext={twitch.ext} fetcher={fetcher} />)
    act(() => twitch.authorize())
    fireEvent.click(screen.getByRole('button', { name: 'Unlink this channel' }))
    expect(await screen.findByText(/Unlinked/)).toBeInTheDocument()
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe('DELETE')
  })
})
