// Pure mdast-based mapping between a source line and a top-level block index.
// At a mode switch both surfaces hold the identical document, so the top-level
// block sequence is shared currency: CodeMirror maps line <-> block index here,
// and the caller maps block index <-> ProseMirror position on the editor side.
// Only the shape we need is typed, so this module needs no mdast type package.

/** Minimal structural view of a positioned mdast node. */
export interface PositionedNode {
  position?: { start: { line: number }; end: { line: number } }
}

/** Minimal structural view of an mdast root (top-level blocks). */
export interface BlockRoot {
  children: PositionedNode[]
}

/**
 * Index of the top-level block whose source range covers `line` (1-based).
 * Clamped to a valid block; returns 0 for an empty document.
 */
export function lineToBlockIndex(root: BlockRoot, line: number): number {
  const blocks = root.children
  if (blocks.length === 0) return 0
  for (let i = 0; i < blocks.length; i++) {
    const end = blocks[i].position?.end.line
    if (end !== undefined && line <= end) return i
  }
  return blocks.length - 1
}

/**
 * 1-based start line of the top-level block at `index` (clamped to a valid
 * block); returns 1 for an empty document or a block missing position info.
 */
export function blockStartLine(root: BlockRoot, index: number): number {
  const blocks = root.children
  if (blocks.length === 0) return 1
  const i = Math.max(0, Math.min(index, blocks.length - 1))
  return blocks[i].position?.start.line ?? 1
}
