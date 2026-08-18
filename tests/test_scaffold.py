"""Tests for the static shadow-root scaffold's contract with the TS renderer."""

from html.parser import HTMLParser

from streamlit_markdown_editor import _scaffold


class _ScaffoldDOM(HTMLParser):
    """Collects the class names and buttons the frontend renderer relies on."""

    def __init__(self) -> None:
        super().__init__()
        self.classes: set[str] = set()
        self.buttons: list[dict[str, str | None]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        self.classes.update((attr.get("class") or "").split())
        if tag == "button":
            self.buttons.append(attr)


def _parse(html: str) -> _ScaffoldDOM:
    dom = _ScaffoldDOM()
    dom.feed(html)
    return dom


def test_scaffold_constants_are_nonempty_strings() -> None:
    assert isinstance(_scaffold.SCAFFOLD_HTML, str)
    assert _scaffold.SCAFFOLD_HTML.strip()
    assert isinstance(_scaffold.SCAFFOLD_CSS, str)
    assert _scaffold.SCAFFOLD_CSS.strip()


def test_scaffold_html_exposes_renderer_query_anchors() -> None:
    # index.ts queries these by class; keep the scaffold and renderer in sync.
    dom = _parse(_scaffold.SCAFFOLD_HTML)
    assert {"sme-root", "sme-toggle", "sme-surface"} <= dom.classes


def test_scaffold_toggle_declares_both_modes_with_wysiwyg_active() -> None:
    dom = _parse(_scaffold.SCAFFOLD_HTML)
    assert [b.get("data-mode") for b in dom.buttons] == ["wysiwyg", "raw"]
    active = [
        b.get("data-mode")
        for b in dom.buttons
        if "sme-active" in (b.get("class") or "")
    ]
    assert active == ["wysiwyg"]


def test_scaffold_css_targets_contract_selectors_and_theme_vars() -> None:
    css = _scaffold.SCAFFOLD_CSS
    for selector in (".sme-root", ".sme-toggle", ".sme-active", ".sme-surface"):
        assert selector in css
    assert "--st-" in css
