import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce } from './debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires once after the delay', () => {
    const fn = vi.fn()
    const d = debounce(fn, 200)
    d()
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('collapses a rapid burst into a single trailing call', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d()
    vi.advanceTimersByTime(50)
    d()
    vi.advanceTimersByTime(50)
    d()
    // Only 100ms of quiet after the last call triggers the single call.
    vi.advanceTimersByTime(99)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('invokes with the latest arguments', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d('a')
    d('b')
    d('c')
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })

  it('cancel() drops a pending call', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d()
    d.cancel()
    vi.advanceTimersByTime(100)
    expect(fn).not.toHaveBeenCalled()
  })

  it('flush() runs a pending call immediately and only once', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d('x')
    d.flush()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('x')
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('flush() with nothing pending does nothing', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d.flush()
    expect(fn).not.toHaveBeenCalled()
  })

  it('can be reused after firing', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d('first')
    vi.advanceTimersByTime(100)
    d('second')
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenNthCalledWith(1, 'first')
    expect(fn).toHaveBeenNthCalledWith(2, 'second')
  })
})
