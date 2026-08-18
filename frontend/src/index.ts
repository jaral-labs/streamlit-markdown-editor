import { debounce, type Debounced } from './debounce'
import { planSwitch, type Mode } from './sync'
import { injectProseMirrorStyles } from './styles'
import { CodeMirrorSurface, MilkdownSurface, type Surface } from './surfaces'
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

/**
 * Per-mount state, persisted across Streamlit reruns in {@link INSTANCES}.
 * `canonical` is the single source-of-truth markdown string; the two
 * {@link Surface}s are synced to/from it. `dirty` means the *inactive* surface
 * is stale vs. `canonical`.
 */
interface Instance {
  buttons: NodeListOf<HTMLButtonElement>
  wysiwyg: Surface
  raw: Surface
  canonical: string
  /** Last-seen consumer revision nonce (undefined if the consumer sends none). */
  revision: number | undefined
  mode: Mode
  dirty: boolean
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

function surfaceOf(inst: Instance, mode: Mode): Surface {
  return mode === 'wysiwyg' ? inst.wysiwyg : inst.raw
}

function setActiveButton(inst: Instance, mode: Mode): void {
  inst.buttons.forEach((b) =>
    b.classList.toggle('sme-active', b.dataset.mode === mode),
  )
}

/** B6/B7: switch mode, lazily rehydrating + carrying the caret across. */
function switchMode(inst: Instance, target: Mode): void {
  const plan = planSwitch(inst.mode, target, inst.dirty)
  if (!plan.changed) return
  const source = surfaceOf(inst, inst.mode)
  const dest = surfaceOf(inst, target)

  if (source.isReady()) inst.canonical = source.getMarkdown()
  const blockIndex = source.captureBlockIndex()
  if (plan.hydrateTarget) {
    dest.setMarkdown(inst.canonical)
    inst.dirty = false
  }
  source.hide()
  dest.show()
  setActiveButton(inst, target)
  inst.mode = target
  dest.restoreBlockIndex(blockIndex)
}

/** B6: wire the scaffold's mode-toggle buttons. */
function setupToggle(inst: Instance): void {
  inst.buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.mode
      if (target === 'wysiwyg' || target === 'raw') switchMode(inst, target)
    })
  })
}

/**
 * First render: query the B2 scaffold, create the surface nodes, mount both
 * editors (B4/B5/B12) and wire the toggle (B6/B7) + debounced push (B8/B11).
 * Registers the new instance in {@link INSTANCES} and returns it.
 */
function mount(
  parentElement: HTMLElement | ShadowRoot,
  data: ComponentData,
): Instance {
  const root = queryOrThrow<HTMLElement>(parentElement, '.sme-root')
  const toggle = queryOrThrow<HTMLElement>(root, '.sme-toggle')
  const surfaceEl = queryOrThrow<HTMLElement>(root, '.sme-surface')
  const wysiwygEl = document.createElement('div')
  wysiwygEl.className = 'sme-wysiwyg'
  const rawEl = document.createElement('div')
  rawEl.className = 'sme-raw'
  surfaceEl.append(wysiwygEl, rawEl)

  const domRoot: Document | ShadowRoot =
    parentElement instanceof ShadowRoot ? parentElement : document
  injectProseMirrorStyles(domRoot)

  const seed = data.value
  // Edits look the instance up at call time (it's registered just below), so
  // the surfaces can be constructed before the instance object exists.
  const onEdit = (md: string): void => {
    const i = INSTANCES.get(parentElement)
    if (!i) return
    i.canonical = md
    i.dirty = true
    i.schedulePush?.()
  }
  const raw = new CodeMirrorSurface(rawEl, seed, domRoot, onEdit)
  const wysiwyg = new MilkdownSurface(wysiwygEl, seed, onEdit, (self) => {
    // If an external update (B9) arrived while Milkdown was mounting and the
    // WYSIWYG surface is active, it loaded with a now-stale seed — resync it.
    const i = INSTANCES.get(parentElement)
    if (i && i.mode === 'wysiwyg' && i.canonical !== seed) {
      self.setMarkdown(i.canonical)
    }
  })
  raw.hide() // WYSIWYG is the default mode

  const inst: Instance = {
    buttons: toggle.querySelectorAll<HTMLButtonElement>('button[data-mode]'),
    wysiwyg,
    raw,
    canonical: seed,
    revision: data.revision,
    mode: 'wysiwyg',
    dirty: false,
    setState: () => {},
    schedulePush: null,
  }
  INSTANCES.set(parentElement, inst)
  inst.schedulePush = debounce(
    () => inst.setState(inst.canonical),
    PUSH_DEBOUNCE_MS,
  )
  setupToggle(inst)

  // B11: commit any pending debounced edit when focus leaves the component
  // entirely (relatedTarget is null when focus exits the shadow tree; moving
  // between the editor and the toggle stays inside `root` and is ignored).
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget as Node | null)) {
      inst.schedulePush?.flush()
    }
  })
  return inst
}

/**
 * B9 inbound reconcile (ARCH-004): a genuine external change (not the echo of
 * our own outbound edit) arrived. Apply it to the active surface and mark the
 * hidden one stale for lazy resync on the next toggle.
 */
function reconcile(inst: Instance, data: ComponentData): void {
  inst.revision = data.revision
  inst.canonical = data.value
  surfaceOf(inst, inst.mode).setMarkdown(inst.canonical)
  inst.dirty = true
}

const renderer: FrontendRenderer<Record<string, unknown>, ComponentData> = (
  args,
) => {
  const { parentElement, data } = args

  let inst = INSTANCES.get(parentElement)
  if (!inst) inst = mount(parentElement, data)
  else if (isExternalChange(inst, data)) reconcile(inst, data)

  // Refresh the outbound callback each render so pushes use the current one.
  inst.setState = (md) => args.setStateValue(STATE_KEY, md)

  // Cleanup on unmount: cancel pending push, tear down editors, drop state.
  return () => {
    const current = INSTANCES.get(parentElement)
    if (current) {
      current.schedulePush?.cancel()
      current.wysiwyg.destroy()
      current.raw.destroy()
      INSTANCES.delete(parentElement)
    }
  }
}

/**
 * Is an inbound `value` a genuine external change vs. the echo of our own
 * outbound edit? Gated by the consumer's `revision` nonce when provided
 * (ARCH-004), else by byte-equality.
 */
function isExternalChange(inst: Instance, data: ComponentData): boolean {
  return data.revision !== undefined
    ? data.revision !== inst.revision
    : data.value !== inst.canonical
}

export default renderer
