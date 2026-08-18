import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { getMarkdown, replaceAll } from '@milkdown/utils'
import { TextSelection } from '@milkdown/prose/state'
import { EditorView, basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { blockStartLine, lineToBlockIndex, type BlockRoot } from './cursor-map'

// Neutral GFM parser used only to recover source-line positions for cursor
// mapping — Milkdown drops them during markdown -> ProseMirror conversion.
const mdParser = unified().use(remarkParse).use(remarkGfm)
function parseBlocks(md: string): BlockRoot {
  return mdParser.parse(md) as unknown as BlockRoot
}

// B10: map Streamlit theme variables (which inherit across the shadow
// boundary) onto CodeMirror so the raw surface matches the app theme —
// especially dark mode, where CodeMirror's default light background clashes.
const cmTheme = EditorView.theme({
  '&': {
    color: 'var(--st-text-color, inherit)',
    backgroundColor: 'transparent',
  },
  '.cm-content': {
    caretColor: 'var(--st-text-color, inherit)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--st-text-color, inherit)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--st-gray-color, inherit)',
    border: 'none',
  },
  '&.cm-focused': {
    outline: 'none',
  },
})

/**
 * One editing surface (WYSIWYG or raw) over the shared canonical markdown.
 * Both implementations encapsulate their editor and suppress the change echo
 * during programmatic `setMarkdown`. The top-level block index is the shared
 * currency for carrying the caret between surfaces (B7 / ARCH-003) — block-level
 * is reliable, exact intra-line column is best-effort.
 */
export interface Surface {
  /** Whether the underlying editor is mounted and usable. */
  isReady(): boolean
  /** Current markdown (call only when `isReady()`). */
  getMarkdown(): string
  /** Load markdown, suppressing the change echo. */
  setMarkdown(md: string): void
  /** Which top-level block the caret currently sits in. */
  captureBlockIndex(): number
  /** Place the caret at the start of the given block. */
  restoreBlockIndex(index: number): void
  show(): void
  hide(): void
  destroy(): void
}

/** Raw-markdown surface backed by CodeMirror 6. Synchronous; always ready. */
export class CodeMirrorSurface implements Surface {
  private readonly el: HTMLElement
  private readonly view: EditorView
  private suppress = false

  constructor(
    el: HTMLElement,
    initial: string,
    root: Document | ShadowRoot,
    onChange: (md: string) => void,
  ) {
    this.el = el
    this.view = new EditorView({
      doc: initial,
      extensions: [
        basicSetup,
        markdown(),
        cmTheme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !this.suppress) onChange(u.state.doc.toString())
        }),
      ],
      parent: el,
      root,
    })
  }

  isReady(): boolean {
    return true
  }

  getMarkdown(): string {
    return this.view.state.doc.toString()
  }

  setMarkdown(md: string): void {
    this.suppress = true
    try {
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: md },
      })
    } finally {
      this.suppress = false
    }
  }

  captureBlockIndex(): number {
    const head = this.view.state.selection.main.head
    const line = this.view.state.doc.lineAt(head).number
    return lineToBlockIndex(parseBlocks(this.getMarkdown()), line)
  }

  restoreBlockIndex(index: number): void {
    const line = blockStartLine(parseBlocks(this.getMarkdown()), index)
    const clamped = Math.max(1, Math.min(line, this.view.state.doc.lines))
    const anchor = this.view.state.doc.line(clamped).from
    this.view.dispatch({ selection: { anchor }, scrollIntoView: true })
    this.view.focus()
  }

  show(): void {
    this.el.style.display = ''
  }

  hide(): void {
    this.el.style.display = 'none'
  }

  destroy(): void {
    this.view.destroy()
  }
}

/**
 * WYSIWYG surface backed by Milkdown. Mounts asynchronously; `onReady` fires
 * once the editor exists so the caller can resync if the canonical string
 * drifted during load. All methods no-op safely before the editor is ready.
 */
export class MilkdownSurface implements Surface {
  private readonly el: HTMLElement
  private editor: Editor | null = null
  private suppress = false

  constructor(
    el: HTMLElement,
    initial: string,
    onChange: (md: string) => void,
    onReady?: (surface: MilkdownSurface) => void,
  ) {
    this.el = el
    void Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, el)
        ctx.set(defaultValueCtx, initial)
        ctx.get(listenerCtx).markdownUpdated((_ctx, md) => {
          if (!this.suppress) onChange(md)
        })
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .create()
      .then((ed) => {
        this.editor = ed
        onReady?.(this)
      })
  }

  isReady(): boolean {
    return this.editor !== null
  }

  getMarkdown(): string {
    return this.editor?.action(getMarkdown()) ?? ''
  }

  setMarkdown(md: string): void {
    if (!this.editor) return
    this.suppress = true
    try {
      this.editor.action(replaceAll(md))
    } finally {
      this.suppress = false
    }
  }

  captureBlockIndex(): number {
    return (
      this.editor?.action((ctx) => {
        const { state } = ctx.get(editorViewCtx)
        return state.selection.$head.index(0)
      }) ?? 0
    )
  }

  restoreBlockIndex(index: number): void {
    this.editor?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { state } = view
      let pos = 0
      for (let j = 0; j < index && j < state.doc.childCount; j++) {
        pos += state.doc.child(j).nodeSize
      }
      pos = Math.min(pos + 1, state.doc.content.size)
      const selection = TextSelection.near(state.doc.resolve(pos))
      view.dispatch(state.tr.setSelection(selection).scrollIntoView())
      view.focus()
    })
  }

  show(): void {
    this.el.style.display = ''
  }

  hide(): void {
    this.el.style.display = 'none'
  }

  destroy(): void {
    void this.editor?.destroy()
  }
}
