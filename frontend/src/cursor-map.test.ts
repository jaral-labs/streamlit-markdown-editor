import { describe, expect, it } from 'vitest'
import { blockStartLine, lineToBlockIndex, type BlockRoot } from './cursor-map'

// Three blocks: line 1, lines 3-5, line 7 (blank lines between).
const root: BlockRoot = {
  children: [
    { position: { start: { line: 1 }, end: { line: 1 } } },
    { position: { start: { line: 3 }, end: { line: 5 } } },
    { position: { start: { line: 7 }, end: { line: 7 } } },
  ],
}
const empty: BlockRoot = { children: [] }

describe('lineToBlockIndex', () => {
  it('maps a line to its covering block', () => {
    expect(lineToBlockIndex(root, 1)).toBe(0)
    expect(lineToBlockIndex(root, 3)).toBe(1)
    expect(lineToBlockIndex(root, 4)).toBe(1)
    expect(lineToBlockIndex(root, 5)).toBe(1)
    expect(lineToBlockIndex(root, 7)).toBe(2)
  })

  it('maps a blank line to the next block', () => {
    expect(lineToBlockIndex(root, 2)).toBe(1) // between block 0 and 1
    expect(lineToBlockIndex(root, 6)).toBe(2) // between block 1 and 2
  })

  it('clamps out-of-range lines', () => {
    expect(lineToBlockIndex(root, 0)).toBe(0)
    expect(lineToBlockIndex(root, 999)).toBe(2)
  })

  it('returns 0 for an empty document', () => {
    expect(lineToBlockIndex(empty, 1)).toBe(0)
  })
})

describe('blockStartLine', () => {
  it('returns the block start line', () => {
    expect(blockStartLine(root, 0)).toBe(1)
    expect(blockStartLine(root, 1)).toBe(3)
    expect(blockStartLine(root, 2)).toBe(7)
  })

  it('clamps out-of-range indices', () => {
    expect(blockStartLine(root, -5)).toBe(1)
    expect(blockStartLine(root, 999)).toBe(7)
  })

  it('returns 1 for an empty document', () => {
    expect(blockStartLine(empty, 0)).toBe(1)
  })
})
