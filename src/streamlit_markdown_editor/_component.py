"""Registration of the Streamlit Component v2 backing this package.

The component is registered lazily, on first use, and the renderer is memoized so
every call reuses it (Streamlit warns and keeps only the last registration if a
name is declared twice).

Why lazy and not at import time
-------------------------------
The file-backed ``js`` glob is validated the moment ``st.components.v2.component``
is called, against the manifest's ``asset_dir`` — which Streamlit only discovers
during ``streamlit run`` setup. Registering at import would raise
``StreamlitAPIException`` on a bare ``import streamlit_markdown_editor`` (tests,
tooling, any non-app context), making the package unimportable outside a running
app. Deferring to first render means the manifest is already discovered by the
time we register.

Contracts this module sits between
----------------------------------
- ``_scaffold`` supplies the static shadow-root HTML/CSS. The frontend renderer
  queries into that DOM rather than building it.
- The component manifest (``[[tool.streamlit.component.components]]`` in
  ``pyproject.toml``, shipped inside the installed package) declares
  ``asset_dir``. ``js`` is resolved against it, so the bundle is referenced by
  glob rather than by content-hashed filename.
"""

from __future__ import annotations

from functools import cache
from typing import TYPE_CHECKING

import streamlit as st

from ._scaffold import SCAFFOLD_CSS, SCAFFOLD_HTML

if TYPE_CHECKING:
    # Type-only: streamlit itself imports this under TYPE_CHECKING. Kept out of
    # the runtime import graph so a move in streamlit's internals is a type error,
    # not an ImportError at runtime.
    from streamlit.components.v2.types import ComponentRenderer

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


@cache
def get_renderer() -> ComponentRenderer:
    """Register the component (once) and return its mount renderer.

    Memoized: the first call registers the component with Streamlit; later calls
    return the same renderer. Must be called from within a running Streamlit app
    (see the module docstring for why registration is deferred to first use).

    Returns
    -------
    ComponentRenderer
        The callable that mounts an instance of the component.
    """
    return st.components.v2.component(
        COMPONENT_NAME,
        html=SCAFFOLD_HTML,
        css=SCAFFOLD_CSS,
        js=_JS_GLOB,
    )
