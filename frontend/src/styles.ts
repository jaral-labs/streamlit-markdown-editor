import proseMirrorCss from '@milkdown/prose/view/style/prosemirror.css?inline'
import proseTablesCss from '@milkdown/prose/tables/style/tables.css?inline'
import proseGapcursorCss from '@milkdown/prose/gapcursor/style/gapcursor.css?inline'

// Plain-core Milkdown ships no theme, and the imported tables CSS only provides
// editing affordances (cell selection, resize) — not display borders. Add
// minimal, theme-aware table styling so GFM tables read as tables in the WYSIWYG
// surface (borders via the inherited Streamlit gray; a neutral header shade that
// works in both light and dark).
const tableBordersCss = `
.ProseMirror table {
  border-collapse: collapse;
  margin: 0.5rem 0;
}
.ProseMirror th,
.ProseMirror td {
  border: 1px solid var(--st-gray-color, #cccccc);
  padding: 4px 10px;
  text-align: left;
  vertical-align: top;
}
.ProseMirror th {
  background: rgba(128, 128, 128, 0.15);
  font-weight: 600;
}
`

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
      [proseMirrorCss, proseTablesCss, proseGapcursorCss, tableBordersCss].join(
        '\n',
      ),
    )
  }
  if (!root.adoptedStyleSheets.includes(sheet)) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
  }
}
