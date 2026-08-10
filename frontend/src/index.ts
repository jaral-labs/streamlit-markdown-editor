import type { FrontendRenderer } from '@streamlit/component-v2-lib'
import type { Editor } from '@milkdown/core'
import type { EditorView } from '@codemirror/view'

/** Payload sent from the Python side via `data=`. */
interface ComponentData {
  value: string
}

type Mode = 'wysiwyg' | 'raw'

/**
 * Per-mount state, persisted across Streamlit reruns in {@link INSTANCES}.
 * `canonical` is the single source-of-truth markdown string; the two editor
 * surfaces are synced to/from it. Editors are created lazily in B4/B5.
 */
interface Instance {
  root: HTMLElement
  toggle: HTMLElement
  surface: HTMLElement
  canonical: string
  mode: Mode
  dirty: boolean
  milkdown: Editor | null
  cmView: EditorView | null
}

// The renderer is re-invoked on every rerun; keying instance state by the
// (persistent) mount element lets us build the editors once and reuse them.
const INSTANCES = new WeakMap<HTMLElement | ShadowRoot, Instance>()

function queryOrThrow<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const el = root.querySelector<T>(selector)
  if (!el) {
    throw new Error(
      `streamlit-markdown-editor: scaffold element "${selector}" not found`,
    )
  }
  return el
}

const renderer: FrontendRenderer<Record<string, unknown>, ComponentData> = (
  args,
) => {
  const { parentElement, data } = args

  let inst = INSTANCES.get(parentElement)
  if (!inst) {
    // First render for this mount: query the B2 scaffold and create state.
    const root = queryOrThrow<HTMLElement>(parentElement, '.sme-root')
    inst = {
      root,
      toggle: queryOrThrow<HTMLElement>(root, '.sme-toggle'),
      surface: queryOrThrow<HTMLElement>(root, '.sme-surface'),
      canonical: data.value,
      mode: 'wysiwyg',
      dirty: false,
      milkdown: null, // mounted in B4
      cmView: null, // mounted in B5
    }
    INSTANCES.set(parentElement, inst)
    // TODO B4/B5: mount Milkdown + CodeMirror 6 into `inst.surface`.
    // TODO B6/B7: wire the mode toggle + line/column cursor sync.
    // TODO B12: inject Milkdown CSS into the shadow root (adoptedStyleSheets).
  } else if (data.value !== inst.canonical) {
    // Re-invoked on a later rerun with an externally-changed value.
    inst.canonical = data.value
    // TODO B9: hydrate the active surface from inst.canonical (guarded).
  }

  // TODO B8: push edits back via args.setStateValue('markdown', canonical) (debounced).

  // Cleanup on unmount: tear down editors and drop the persisted state.
  return () => {
    const current = INSTANCES.get(parentElement)
    if (current) {
      // TODO B11: await current.milkdown?.destroy(); current.cmView?.destroy()
      INSTANCES.delete(parentElement)
    }
  }
}

export default renderer
