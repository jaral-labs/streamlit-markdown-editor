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

from collections.abc import Callable
from typing import Literal

import streamlit as st
from streamlit.errors import StreamlitAPIException

from ._component import get_renderer

#: Python -> JS: key under which the source markdown is sent in ``data`` (the
#: frontend reads ``data.value``).
_DATA_KEY = "value"

#: JS -> Python: state key the frontend reports the edited markdown under. Must
#: match ``STATE_KEY`` in ``frontend/src/index.ts``.
_STATE_KEY = "markdown"

#: Python -> JS: revision nonce key in ``data``; mirrors ``ComponentData.revision``
#: in the frontend, which applies an inbound value only when this value changes.
_REVISION_KEY = "revision"

#: Prefix for the per-widget reconcile bookkeeping kept in ``st.session_state``,
#: namespaced away from the widget's own ``key``.
_TRACK_KEY_PREFIX = "_smd_reconcile::"

#: Accepted layout values, mirroring Streamlit's own contract (pixel ``int`` or
#: the two sentinels). Declared locally rather than imported from the private
#: ``streamlit.elements.lib.layout_utils`` module.
Width = int | Literal["stretch", "content"]
Height = int | Literal["stretch", "content"]


def st_markdown_editor(
    value: str = "",
    *,
    key: str | None = None,
    equivalent: Callable[[str, str], bool] | None = None,
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
        editor on a page, or to preserve editor state across reruns. Required
        when ``equivalent`` is set.
    equivalent : callable or None, optional
        ``equivalent(candidate, current) -> bool`` deciding whether an inbound
        ``value`` is a genuine external change or an echo of the editor's own
        output — the consumer's canonicalization / equality. When provided, a
        ``key`` is required. Omitted (the default) uses byte-equality.
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
    if equivalent is not None:
        if key is None:
            raise StreamlitAPIException(
                "st_markdown_editor: `key` is required when `equivalent` is set."
            )
        return _render_with_reconcile(value, key, equivalent, width, height)

    # Byte-equality path (no `equivalent`): today's behavior, unchanged.
    result = get_renderer()(
        key=key,
        data={_DATA_KEY: value},
        width=width,
        height=height,
    )
    reported = result.get(_STATE_KEY, value)
    return reported if isinstance(reported, str) else value


def _render_with_reconcile(
    value: str,
    key: str,
    equivalent: Callable[[str, str], bool],
    width: Width,
    height: Height,
) -> str:
    """Mount the editor in equivalence mode and return its markdown.

    Owns the reconcile cycle for a keyed widget: read the tracked
    ``{last_output, revision}`` from ``st.session_state``, decide echo-vs-external
    via ``equivalent(value, last_output)``, bump ``revision`` only on a genuine
    external change, mount with ``data={"value", "revision"}``, then update the
    tracking — returning ``value`` on a forced reconcile (the frontend suppresses
    the echo) or the reported markdown otherwise.

    Parameters
    ----------
    value : str
        The markdown to load.
    key : str
        The widget key, and the ``session_state`` tracking key. Required.
    equivalent : callable
        ``equivalent(candidate, current) -> bool`` — echo-vs-external equality,
        compared against the editor's last output.
    width : int or {"stretch", "content"}
        Component width.
    height : int or {"stretch", "content"}
        Component height.

    Returns
    -------
    str
        The current markdown.
    """
    tracking_key = _TRACK_KEY_PREFIX + key

    # Recover the last output and revision for this widget (defaults on first use
    # or corrupt state); isinstance guards keep the values typed out of the
    # untyped session_state.
    last_output = value
    revision = 0
    tracked = st.session_state.get(tracking_key)
    if isinstance(tracked, dict):
        stored_output = tracked.get("last_output")
        if isinstance(stored_output, str):
            last_output = stored_output
        stored_revision = tracked.get("revision")
        if isinstance(stored_revision, int):
            revision = stored_revision

    # A genuine external change (per the consumer's equality) bumps the nonce; an
    # echo of the editor's own output leaves it unchanged so edits survive.
    external = not equivalent(value, last_output)
    if external:
        revision += 1

    result = get_renderer()(
        key=key,
        data={_DATA_KEY: value, _REVISION_KEY: revision},
        width=width,
        height=height,
    )

    if external:
        # The frontend adopts `value` and suppresses the echo, so record it as the
        # new output rather than reading the (now stale) reported state.
        new_output = value
    else:
        reported = result.get(_STATE_KEY, value)
        new_output = reported if isinstance(reported, str) else value

    st.session_state[tracking_key] = {
        "last_output": new_output,
        "revision": revision,
    }
    return new_output
