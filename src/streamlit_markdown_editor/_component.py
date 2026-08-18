"""Registration of the Streamlit Component v2 backing this package.

The component is declared once, at import time, and the resulting renderer is
reused for every call; Streamlit warns and keeps only the last registration if a
name is declared twice.

Contracts this module sits between
----------------------------------
- ``_scaffold`` supplies the static shadow-root HTML/CSS. The frontend renderer
  queries into that DOM rather than building it.
- The component manifest (``[[tool.streamlit.component.components]]`` in
  ``pyproject.toml``, shipped inside the installed package) declares
  ``asset_dir``. ``js`` is resolved against it, so the bundle is referenced by
  glob rather than by content-hashed filename.
"""

import streamlit as st

from ._scaffold import SCAFFOLD_CSS, SCAFFOLD_HTML

#: Fully-qualified component key: ``"<[project].name>.<component.name>"``, the
#: form Streamlit builds when scanning the manifest. It is passed through
#: verbatim, so it must match the manifest exactly or file-backed ``js`` fails
#: to resolve its ``asset_dir``.
COMPONENT_NAME = "streamlit-markdown-editor.streamlit_markdown_editor"

#: Vite content-hashes the bundle (``index-<hash>.js``), so the asset is named by
#: glob. Streamlit requires the glob to match exactly one file under
#: ``asset_dir`` — a stale build left beside a fresh one is an error, not a
#: silent pick.
_JS_GLOB = "index-*.js"

_renderer = st.components.v2.component(
    COMPONENT_NAME,
    html=SCAFFOLD_HTML,
    css=SCAFFOLD_CSS,
    js=_JS_GLOB,
)
