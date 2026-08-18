"""Tests for the public API and lazy component registration.

These mock the Streamlit boundary. ``st_markdown_editor`` cannot be *called* and
the component cannot be *registered* outside a running Streamlit app: the
file-backed ``js`` glob is validated against a manifest that Streamlit only
discovers during ``streamlit run``. Mocking lets the return contract and the
registration wiring be unit-tested here; end-to-end behaviour is validated
separately with ``streamlit run``.
"""

from unittest.mock import MagicMock, patch

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
