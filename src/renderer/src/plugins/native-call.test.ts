// @vitest-environment jsdom

import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { PluginNativeCallError } from '../../../plugin-sdk/src/types'
import { NativeCallError, callNativeBackend } from './native-call'

type NativeCallResult = { ok: true; payload: Uint8Array } | { ok: false; error: { message: string; code: string } }

function stubNativeCall(result: NativeCallResult): ReturnType<typeof vi.fn> {
  const pluginNativeCall = vi.fn(async () => result)
  window.api = { pluginNativeCall } as unknown as typeof window.api
  return pluginNativeCall
}

afterEach(() => {
  Reflect.deleteProperty(window, 'api')
})

describe('callNativeBackend', () => {
  it('resolves the payload of a successful call', async () => {
    const payload = Uint8Array.of(1, 2, 3)
    const pluginNativeCall = stubNativeCall({ ok: true, payload })

    const request = Uint8Array.of(7)
    await expect(callNativeBackend('demo', '/example.v1.Service/Analyze', request)).resolves.toBe(payload)
    expect(pluginNativeCall).toHaveBeenCalledWith('demo', '/example.v1.Service/Analyze', request)
  })

  it('rejects with a NativeCallError that carries the host code', async () => {
    stubNativeCall({ ok: false, error: { message: 'x', code: 'UNAVAILABLE' } })

    const rejection = await callNativeBackend('demo', '/example.v1.Service/Analyze', new Uint8Array()).catch(
      (err: unknown) => err,
    )

    expect(rejection).toBeInstanceOf(NativeCallError)
    expect(rejection).toBeInstanceOf(Error)
    const error = rejection as NativeCallError
    expect(error.name).toBe('NativeCallError')
    expect(error.message).toBe('x')
    expect(error.code).toBe('UNAVAILABLE')
  })

  it('passes a backend-defined code through unchanged', async () => {
    stubNativeCall({ ok: false, error: { message: 'bad item', code: 'ITEM_UNPARSEABLE' } })

    await expect(callNativeBackend('demo', '/example.v1.Service/Analyze', new Uint8Array())).rejects.toMatchObject({
      name: 'NativeCallError',
      code: 'ITEM_UNPARSEABLE',
    })
  })

  it('matches the SDK-documented rejection type', () => {
    expectTypeOf<NativeCallError>().toMatchTypeOf<PluginNativeCallError>()
  })
})
