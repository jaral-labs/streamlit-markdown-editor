export interface Debounced<A extends unknown[]> {
  (...args: A): void
  /** Cancel any pending invocation without running it. */
  cancel: () => void
  /** Run any pending invocation immediately. */
  flush: () => void
}

/**
 * Collapse a burst of calls into a single trailing invocation that fires `ms`
 * after the last call. `cancel` drops a pending call; `flush` runs it now.
 * Pure and timer-driven — unit-tested with fake timers (TECH-007).
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: A | null = null

  const run = (): void => {
    timer = undefined
    if (pending !== null) {
      const args = pending
      pending = null
      fn(...args)
    }
  }

  const debounced = (...args: A): void => {
    pending = args
    clearTimeout(timer)
    timer = setTimeout(run, ms)
  }

  const cancel = (): void => {
    clearTimeout(timer)
    timer = undefined
    pending = null
  }

  const flush = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer)
      run()
    }
  }

  return Object.assign(debounced, { cancel, flush })
}
