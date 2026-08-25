"""Streamlit Markdown Editor.

A dual-mode (WYSIWYG ⇄ raw), markdown-in / markdown-out editor component for
Streamlit, built on Milkdown and CodeMirror 6.
"""

from ._api import st_markdown_editor

__all__ = ["st_markdown_editor"]

__version__ = "0.1.0"  # x-release-please-version
