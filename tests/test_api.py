"""Tests for the public API and lazy component registration.

These mock the Streamlit boundary. ``st_markdown_editor`` cannot be *called* and
the component cannot be *registered* outside a running Streamlit app: the
file-backed ``js`` glob is validated against a manifest that Streamlit only
discovers during ``streamlit run``. Mocking lets the return contract and the
registration wiring be unit-tested here; end-to-end behaviour is validated
separately with ``streamlit run``.
"""

from unittest.mock import MagicMock, patch

import pytest
from streamlit.errors import StreamlitAPIException

from streamlit_markdown_editor import _api, _component, st_markdown_editor


def _fake_renderer(state: dict[str, object]) -> MagicMock:
    """A stand-in mount renderer that returns a fixed state dict when called."""
    return MagicMock(return_value=dict(state))


def test_returns_input_value_on_first_render() -> None:
    # Empty state (the frontend has reported nothing yet) -> echo the input back.
    with patch.object(_api, "get_renderer", return_value=_fake_renderer({})):
        assert st_markdown_editor("# Hello") == "# Hello"


def test_returns_reported_markdown_after_edit() -> None:
    state = {"markdown": "# Edited"}
    with patch.object(_api, "get_renderer", return_value=_fake_renderer(state)):
        assert st_markdown_editor("# Hello") == "# Edited"


def test_non_string_state_falls_back_to_value() -> None:
    # A malformed / non-str reported value must not break the str return contract.
    with patch.object(
        _api, "get_renderer", return_value=_fake_renderer({"markdown": 123})
    ):
        assert st_markdown_editor("# Hello") == "# Hello"


def test_forwards_arguments_to_the_renderer() -> None:
    renderer = _fake_renderer({})
    with patch.object(_api, "get_renderer", return_value=renderer):
        st_markdown_editor("# Doc", key="ed", width="content", height=400)
    renderer.assert_called_once_with(
        key="ed", data={"value": "# Doc"}, width="content", height=400
    )


def test_get_renderer_registers_once_and_memoizes() -> None:
    sentinel = object()
    _component.get_renderer.cache_clear()
    try:
        with patch(
            "streamlit.components.v2.component", return_value=sentinel
        ) as component:
            first = _component.get_renderer()
            second = _component.get_renderer()
        assert first is sentinel
        assert second is sentinel
        component.assert_called_once()
        # Registered under the fully-qualified manifest key.
        assert component.call_args.args[0] == _component.COMPONENT_NAME
    finally:
        _component.get_renderer.cache_clear()


# --- Inbound reconciliation (the equivalent callback) ---------------------


def _exact(candidate: str, current: str) -> bool:
    return candidate == current


def _whitespace_insensitive(candidate: str, current: str) -> bool:
    return candidate.strip() == current.strip()


def test_equivalent_without_key_raises() -> None:
    # The guard fires before any state or renderer access.
    with pytest.raises(StreamlitAPIException):
        st_markdown_editor("# x", equivalent=_exact)


def test_genuine_change_bumps_revision_and_returns_value() -> None:
    session: dict[str, object] = {}
    renderer = MagicMock(return_value={})
    with (
        patch.object(_api, "get_renderer", return_value=renderer),
        patch.object(_api.st, "session_state", session),
    ):
        st_markdown_editor("# A", key="k", equivalent=_exact)  # seed
        out = st_markdown_editor("# B", key="k", equivalent=_exact)  # external change
    assert out == "# B"
    assert renderer.call_args.kwargs["data"] == {"value": "# B", "revision": 1}


def test_echo_holds_revision_and_returns_reported_markdown() -> None:
    session: dict[str, object] = {}
    renderer = MagicMock()
    with (
        patch.object(_api, "get_renderer", return_value=renderer),
        patch.object(_api.st, "session_state", session),
    ):
        renderer.return_value = {"markdown": "# A"}
        st_markdown_editor("# A", key="k", equivalent=_exact)  # seed
        renderer.return_value = {"markdown": "# A edited"}
        # Same value passed back while the user has edited -> echo, not external.
        out = st_markdown_editor("# A", key="k", equivalent=_exact)
    assert out == "# A edited"
    assert renderer.call_args.kwargs["data"]["revision"] == 0


def test_normalized_equivalent_treats_reformatted_echo_as_echo() -> None:
    session: dict[str, object] = {}
    renderer = MagicMock(return_value={"markdown": "# A"})
    with (
        patch.object(_api, "get_renderer", return_value=renderer),
        patch.object(_api.st, "session_state", session),
    ):
        st_markdown_editor("# A", key="k", equivalent=_whitespace_insensitive)  # seed
        # A whitespace-only reformat of the last output is recognized as an echo.
        st_markdown_editor("# A   \n", key="k", equivalent=_whitespace_insensitive)
    assert renderer.call_args.kwargs["data"]["revision"] == 0


def test_reconcile_non_string_reported_falls_back_to_value() -> None:
    session: dict[str, object] = {}
    renderer = MagicMock(return_value={"markdown": 123})
    with (
        patch.object(_api, "get_renderer", return_value=renderer),
        patch.object(_api.st, "session_state", session),
    ):
        # Echo path with a non-str reported value -> fall back to the input.
        out = st_markdown_editor("# A", key="k", equivalent=_exact)
    assert out == "# A"


def test_reconcile_state_persists_across_reruns() -> None:
    session: dict[str, object] = {}
    renderer = MagicMock(return_value={})
    with (
        patch.object(_api, "get_renderer", return_value=renderer),
        patch.object(_api.st, "session_state", session),
    ):
        st_markdown_editor("# A", key="k", equivalent=_exact)  # seed
        st_markdown_editor("# B", key="k", equivalent=_exact)  # external
        st_markdown_editor("# C", key="k", equivalent=_exact)  # external
    # Two genuine changes after the seed -> revision 2, last_output tracked.
    assert session[_api._TRACK_KEY_PREFIX + "k"] == {
        "last_output": "# C",
        "revision": 2,
    }
