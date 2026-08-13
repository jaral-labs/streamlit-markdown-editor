"""Static shadow-root scaffold for the streamlit-markdown-editor component.

``SCAFFOLD_HTML`` is passed to ``st.components.v2.component(html=...)`` and rendered
into the component's shadow root *before* the frontend renderer runs. The renderer
(frontend TypeScript) does not build this DOM — it queries into it and wires behavior
onto it.

Contract with the frontend renderer
------------------------------------
These class and ``data-*`` names are a contract with the TS renderer's
``querySelector`` calls; keep them in sync:

- ``.sme-root``    : wrapper the renderer anchors on.
- ``.sme-toggle``  : mode-switch control; its buttons carry ``data-mode="wysiwyg"``
  or ``data-mode="raw"``, and the active button carries the ``sme-active`` class.
- ``.sme-surface`` : container the editors mount into (Milkdown WYSIWYG + CodeMirror 6
  raw), shown/hidden per the active mode.

``SCAFFOLD_CSS`` is small glue passed to ``st.components.v2.component(css=...)`` —
layout and Streamlit theme-variable (``--st-*``) bridging only. The bulk editor
stylesheets are delivered into the shadow root from the frontend bundle instead
(Milkdown via ``adoptedStyleSheets``; CodeMirror via its ``root`` option).
"""

SCAFFOLD_HTML: str = """
<div class="sme-root">
  <div class="sme-toggle">
    <button type="button" data-mode="wysiwyg" class="sme-active">WYSIWYG</button>
    <button type="button" data-mode="raw">Raw</button>
  </div>
  <div class="sme-surface"></div>
</div>
"""

SCAFFOLD_CSS: str = """
.sme-root {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  color: var(--st-text-color, inherit);
}
.sme-toggle {
  display: flex;
  gap: 0.25rem;
}
.sme-toggle button {
  padding: 2px 10px;
  border: 1px solid var(--st-gray-color, #cccccc);
  background: transparent;
  color: var(--st-text-color, inherit);
  border-radius: 4px;
  cursor: pointer;
}
.sme-toggle button.sme-active {
  background: var(--st-primary-color, #ff4b4b);
  border-color: var(--st-primary-color, #ff4b4b);
  color: #ffffff;
}
.sme-surface {
  border: 1px solid var(--st-gray-color, #dddddd);
  border-radius: 4px;
  min-height: 8rem;
  color: var(--st-text-color, inherit);
  font-family: var(--st-font, inherit);
}
.sme-surface .ProseMirror {
  padding: 0.5rem;
  outline: none;
}
"""
