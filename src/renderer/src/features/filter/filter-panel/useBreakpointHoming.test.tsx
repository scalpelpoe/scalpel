// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useBreakpointHoming } from './useBreakpointHoming'

const bps = [
  { min: 1, max: 4 },
  { min: 5, max: 9 },
  { min: 10, max: Number.POSITIVE_INFINITY },
]

describe('useBreakpointHoming', () => {
  it('homes to the segment matching the initial value on mount', () => {
    const onSelect = vi.fn()
    renderHook(({ value }) => useBreakpointHoming(true, bps, value, onSelect), { initialProps: { value: 1 } })
    expect(onSelect).toHaveBeenLastCalledWith(0)
  })

  it('re-homes when the value changes (the stack-size bug)', () => {
    const onSelect = vi.fn()
    const { rerender } = renderHook(({ value }) => useBreakpointHoming(true, bps, value, onSelect), {
      initialProps: { value: 1 },
    })
    expect(onSelect).toHaveBeenLastCalledWith(0)
    rerender({ value: 15 })
    expect(onSelect).toHaveBeenLastCalledWith(2)
  })

  it('does not re-home on a re-render that leaves the value unchanged (a manual drag survives)', () => {
    // A manual slider drag lives in the parent's selection state and re-renders this
    // hook with a fresh breakpoints array but the SAME item value. The hook must not
    // fire then, or it would clobber the segment the user just dragged to. This guards
    // against anyone adding `breakpoints`/`onSelect` to the dependency array.
    const onSelect = vi.fn()
    const { rerender } = renderHook(({ bpsRef }) => useBreakpointHoming(true, bpsRef, 5, onSelect), {
      initialProps: { bpsRef: bps.map((b) => ({ ...b })) },
    })
    onSelect.mockClear()
    rerender({ bpsRef: bps.map((b) => ({ ...b })) })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('falls back to index 0 when no segment contains the value', () => {
    const onSelect = vi.fn()
    renderHook(() =>
      useBreakpointHoming(
        true,
        [
          { min: 5, max: 9 },
          { min: 10, max: Number.POSITIVE_INFINITY },
        ],
        1,
        onSelect,
      ),
    )
    expect(onSelect).toHaveBeenLastCalledWith(0)
  })

  it('is inert while inactive or breakpoints are absent', () => {
    const onSelect = vi.fn()
    renderHook(() => useBreakpointHoming(false, bps, 5, onSelect))
    renderHook(() => useBreakpointHoming(true, undefined, 5, onSelect))
    expect(onSelect).not.toHaveBeenCalled()
  })
})
