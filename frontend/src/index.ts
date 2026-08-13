import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { getMarkdown, replaceAll } from '@milkdown/utils'
import { EditorView, basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import proseMirrorCss from '@milkdown/prose/view/style/prosemirror.css?inline'
import proseTablesCss from '@milkdown/prose/tables/style/tables.css?inline'
import proseGapcursorCss from '@milkdown/prose/gapcursor/style/gapcursor.css?inline'
import { debounce, type Debounced } from './debounce'
import type { FrontendRenderer } from '@streamlit/component-v2-lib'

/** State key the markdown value is reported back to Python under. */
const STATE_KEY = 'markdown'
/** Trailing delay before an edit is pushed to Python (one rerun per pause). */
const PUSH_DEBOUNCE_MS = 200

/** Payload sent from the Python side via `data=`. */
interface ComponentData {
  value: string
  /**
   * Optional consumer-controlled nonce (ARCH-004). When present, an inbound
   * `value` counts as a genuine external change only when `revision` changes —
   * the consumer decides that in Python. When absent, byte-equality is used.
   */
  revision?: number
}

type Mode = 'wysiwyg' | 'raw'

/**
 * Per-mount state, persisted across Streamlit reruns in {@link INSTANCES}.
 * `canonical` is the single source-of-truth markdown string; the two editor
 * surfaces (Milkdown WYSIWYG + CodeMirror 6 raw) are synced to/from it.
 * `dirty` means the *inactive* surface is stale vs. `canonical`; `hydrating`
 * suppresses the change echo while we load `canonical` into a surface.
 */
interface Instance {
  toggle: HTMLElement
  wysiwygEl: HTMLElement
  rawEl: HTMLElement
  canonical: string
  /** Last-seen consumer revision nonce (undefined if the consumer sends none). */
  revision: number | undefined
  mode: Mode
  dirty: boolean
  hydrating: boolean
  milkdown: Editor | null
  cmView: EditorView | null
  /** Push a value to Python; refreshed each render to the latest callback. */
  setState: (md: string) => void
  /** Debounced outbound push; created once, cancelled on cleanup. */
  schedulePush: Debounced<[]> | null
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

// Milkdown/ProseMirror CSS is not shadow-aware, so a normal `import './x.css'`
// (which injects into document <head>) would never reach an editor mounted in
// the component's shadow root. We instead adopt the CSS as a constructed
// stylesheet on the mount's root. Built once, shared across roots. CodeMirror
// styles itself via its `root` option (see mountCodeMirror).
let proseStyleSheet: CSSStyleSheet | null = null

function injectProseMirrorStyles(root: Document | ShadowRoot): void {
  if (proseStyleSheet === null) {
    proseStyleSheet = new CSSStyleSheet()
    proseStyleSheet.replaceSync(
      [proseMirrorCss, proseTablesCss, proseGapcursorCss].join('\n'),
    )
  }
  if (!root.adoptedStyleSheets.includes(proseStyleSheet)) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, proseStyleSheet]
  }
}

/** Mount Milkdown (WYSIWYG) into `el`, seeded with `initial` markdown. */
async function mountMilkdown(
  el: HTMLElement,
  initial: string,
  onChange: (md: string) => void,
): Promise<Editor> {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, el)
      ctx.set(defaultValueCtx, initial)
      ctx.get(listenerCtx).markdownUpdated((_ctx, md) => onChange(md))
    })
    .use(commonmark)
    .use(gfm)
    .use(listener)
    .create()
}

/** Mount CodeMirror 6 (raw markdown) into `el`, seeded with `initial`. */
function mountCodeMirror(
  el: HTMLElement,
  initial: string,
  root: Document | ShadowRoot,
  onChange: (md: string) => void,
): EditorView {
  return new EditorView({
    doc: initial,
    extensions: [
      basicSetup,
      markdown(),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange(u.state.doc.toString())
      }),
    ],
    parent: el,
    root,
  })
}

/**
 * B4/B5/B12: mount both editors into the scaffold surface nodes, inject the
 * ProseMirror CSS, and wire edit events to the canonical string + debounced push.
 */
function mountEditors(
  inst: Instance,
  parentElement: HTMLElement | ShadowRoot,
): void {
  const root: Document | ShadowRoot =
    parentElement instanceof ShadowRoot ? parentElement : document
  injectProseMirrorStyles(root)

  // A user edit on the active surface updates `canonical`, marks the other
  // (hidden) surface stale, and schedules a push to Python. Programmatic
  // hydration sets `hydrating` to skip this echo.
  const onEdit = (md: string): void => {
    if (inst.hydrating) return
    inst.canonical = md
    inst.dirty = true
    inst.schedulePush?.()
  }

  const seed = inst.canonical
  inst.cmView = mountCodeMirror(inst.rawEl, seed, root, onEdit)
  void mountMilkdown(inst.wysiwygEl, seed, onEdit).then((ed) => {
    inst.milkdown = ed
    // If an external update (B9) arrived while Milkdown was mounting and the
    // WYSIWYG surface is active, it loaded with a now-stale seed — resync it.
    // (The raw-active case is covered by `dirty` + the toggle's lazy resync.)
    if (inst.mode === 'wysiwyg' && inst.canonical !== seed) {
      hydrate(inst, 'wysiwyg')
    }
  })
}

/** Serialize whichever surface is active into `canonical` (defensive). */
function pullCanonical(inst: Instance): void {
  if (inst.mode === 'wysiwyg' && inst.milkdown) {
    inst.canonical = inst.milkdown.action(getMarkdown())
  } else if (inst.mode === 'raw' && inst.cmView) {
    inst.canonical = inst.cmView.state.doc.toString()
  }
}

/** Load `canonical` into the given surface, suppressing the change echo. */
function hydrate(inst: Instance, mode: Mode): void {
  inst.hydrating = true
  try {
    if (mode === 'wysiwyg') {
      inst.milkdown?.action(replaceAll(inst.canonical))
    } else if (inst.cmView) {
      const view = inst.cmView
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: inst.canonical },
      })
    }
  } finally {
    inst.hydrating = false
  }
}

/** B6: switch mode, lazily rehydrating the target only when the source is dirty. */
function switchMode(inst: Instance, target: Mode): void {
  if (target === inst.mode) return
  pullCanonical(inst)
  if (inst.dirty) {
    hydrate(inst, target)
    inst.dirty = false
  }
  inst.wysiwygEl.style.display = target === 'wysiwyg' ? '' : 'none'
  inst.rawEl.style.display = target === 'raw' ? '' : 'none'
  inst.toggle
    .querySelectorAll<HTMLButtonElement>('button[data-mode]')
    .forEach((b) => b.classList.toggle('sme-active', b.dataset.mode === target))
  inst.mode = target
}

/** B6: wire the scaffold's mode-toggle buttons. */
function setupToggle(inst: Instance): void {
  inst.toggle
    .querySelectorAll<HTMLButtonElement>('button[data-mode]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.mode
        if (target === 'wysiwyg' || target === 'raw') switchMode(inst, target)
      })
    })
}

const renderer: FrontendRenderer<Record<string, unknown>, ComponentData> = (
  args,
) => {
  const { parentElement, data } = args

  let inst = INSTANCES.get(parentElement)
  if (!inst) {
    // First render: query the B2 scaffold, create the surface nodes + state,
    // mount both editors (B4/B5/B12) and wire the toggle (B6) + push (B8).
    const root = queryOrThrow<HTMLElement>(parentElement, '.sme-root')
    const surface = queryOrThrow<HTMLElement>(root, '.sme-surface')
    const wysiwygEl = document.createElement('div')
    wysiwygEl.className = 'sme-wysiwyg'
    const rawEl = document.createElement('div')
    rawEl.className = 'sme-raw'
    rawEl.style.display = 'none' // WYSIWYG is the default mode
    surface.append(wysiwygEl, rawEl)

    inst = {
      toggle: queryOrThrow<HTMLElement>(root, '.sme-toggle'),
      wysiwygEl,
      rawEl,
      canonical: data.value,
      revision: data.revision,
      mode: 'wysiwyg',
      dirty: false,
      hydrating: false,
      milkdown: null,
      cmView: null,
      setState: () => {},
      schedulePush: null,
    }
    INSTANCES.set(parentElement, inst)
    const created = inst
    created.schedulePush = debounce(
      () => created.setState(created.canonical),
      PUSH_DEBOUNCE_MS,
    )
    mountEditors(created, parentElement)
    setupToggle(created)
    // TODO B7: line/column cursor sync on mode switch.
  } else {
    // B9 inbound reconcile (ARCH-004). A genuine external change (vs. the echo
    // of our own outbound edit) is detected by the consumer's `revision` nonce
    // when provided, else by byte-equality. On a real change, apply `value` to
    // the active surface (guarded via `hydrating`) and mark the hidden one stale.
    const external =
      data.revision !== undefined
        ? data.revision !== inst.revision
        : data.value !== inst.canonical
    if (external) {
      inst.revision = data.revision
      inst.canonical = data.value
      hydrate(inst, inst.mode)
      inst.dirty = true
    }
  }

  // Refresh the outbound callback each render so pushes use the current one.
  inst.setState = (md) => args.setStateValue(STATE_KEY, md)

  // Cleanup on unmount: cancel pending push, tear down editors, drop state.
  return () => {
    const current = INSTANCES.get(parentElement)
    if (current) {
      current.schedulePush?.cancel()
      void current.milkdown?.destroy()
      current.cmView?.destroy()
      INSTANCES.delete(parentElement)
    }
  }
}

export default renderer
