import proseMirrorCss from '@milkdown/prose/view/style/prosemirror.css?inline'
import proseTablesCss from '@milkdown/prose/tables/style/tables.css?inline'
import proseGapcursorCss from '@milkdown/prose/gapcursor/style/gapcursor.css?inline'

// Milkdown/ProseMirror CSS is not shadow-aware, so a normal `import './x.css'`
// (which injects into document <head>) would never reach an editor mounted in
// the component's shadow root. We instead adopt the CSS as a constructed
// stylesheet on the mount's root. Built once, shared across roots. CodeMirror
// styles itself via its `root` option (see CodeMirrorSurface).
let sheet: CSSStyleSheet | null = null

/** Adopt the ProseMirror/Milkdown stylesheet onto the given root (idempotent). */
export function injectProseMirrorStyles(root: Document | ShadowRoot): void {
  if (sheet === null) {
    sheet = new CSSStyleSheet()
    sheet.replaceSync(
      [proseMirrorCss, proseTablesCss, proseGapcursorCss].join('\n'),
    )
  }
  if (!root.adoptedStyleSheets.includes(sheet)) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
  }
}
