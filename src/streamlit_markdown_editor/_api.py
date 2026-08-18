"""Public API: the ``st_markdown_editor`` widget.

Markdown in, markdown out. The caller passes the current markdown as ``value``
and gets the (possibly edited) markdown back. Data crosses the Python <->
frontend boundary through two keys that mirror ``frontend/src/index.ts``:

- ``value`` (Python -> JS): the markdown the editor should load, sent via ``data``.
- ``markdown`` (JS -> Python): the edited markdown the frontend reports back as a
  persistent state value.

On the first render the frontend has not reported anything yet, so the returned
state is empty and the input ``value`` is echoed back unchanged.
"""

from __future__ import annotations

from typing import Literal

from ._component import get_renderer

#: Python -> JS: key under which the source markdown is sent in ``data`` (the
#: frontend reads ``data.value``).
_DATA_KEY = "value"

#: JS -> Python: state key the frontend reports the edited markdown under. Must
#: match ``STATE_KEY`` in ``frontend/src/index.ts``.
_STATE_KEY = "markdown"

#: Accepted layout values, mirroring Streamlit's own contract (pixel ``int`` or
#: the two sentinels). Declared locally rather than imported from the private
#: ``streamlit.elements.lib.layout_utils`` module.
Width = int | Literal["stretch", "content"]
Height = int | Literal["stretch", "content"]


def st_markdown_editor(
    value: str = "",
    *,
    key: str | None = None,
    width: Width = "stretch",
    height: Height = "content",
) -> str:
    """Render a dual-mode (WYSIWYG/raw) markdown editor and return its markdown.

    Parameters
    ----------
    value : str, optional
        The markdown to load into the editor. On reruns, pass the markdown you
        want reflected; the editor reconciles an external change against any
        in-progress edit. Defaults to an empty document.
    key : str or None, optional
        A unique key for the widget. Use a stable key to render more than one
        editor on a page, or to preserve editor state across reruns.
    width : int or {"stretch", "content"}, optional
        Component width: a pixel count, ``"stretch"`` (fill the container, the
        default), or ``"content"``.
    height : int or {"stretch", "content"}, optional
        Component height: a pixel count, ``"content"`` (fit the content, the
        default), or ``"stretch"``.

    Returns
    -------
    str
        The current markdown: equal to ``value`` on the first render (before any
        edit), and the edited markdown thereafter.

    Examples
    --------
    >>> import streamlit as st
    >>> from streamlit_markdown_editor import st_markdown_editor
    >>> text = st_markdown_editor("# Hello", key="editor")
    >>> st.markdown(text)
    """
    result = get_renderer()(
        key=key,
        data={_DATA_KEY: value},
        width=width,
        height=height,
    )
    reported = result.get(_STATE_KEY, value)
    return reported if isinstance(reported, str) else value
