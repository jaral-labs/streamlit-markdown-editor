"""Manual browser-validation app for st_markdown_editor (issue #9).

Run with ``streamlit run examples/app.py`` to exercise the editor end to end.
"""

import streamlit as st

from streamlit_markdown_editor import st_markdown_editor

st.set_page_config(page_title="Markdown Editor — dev", layout="wide")

st.title("streamlit-markdown-editor — dev harness")
st.caption(
    "Manual validation for issue #9. Panel A exercises the plain round-trip "
    "(toggle, caret carry, debounce, flush-on-blur); Panel B exercises inbound "
    "reconcile (the revision / equivalent behavior). Flip Streamlit's light/dark "
    "theme in Settings to check theming."
)

st.header("Panel A — plain round-trip")
st.write(
    "No `equivalent`: the default byte-equality path. Toggle WYSIWYG ⇄ raw, move "
    "the caret across a mode switch, type and watch the debounced output update, "
    "then blur to flush. The blocks below reflect the editor's return value."
)

basic = st_markdown_editor("# Hello\n\nType here…", key="basic")

st.markdown("**Rendered return:**")
st.markdown(basic)
st.markdown("**Raw return:**")
st.code(basic, language="markdown")

st.header("Panel B — inbound reconcile")
st.write(
    "`equivalent` is supplied. The editor's return is stored and fed back as "
    "`value`, so your edits stick (each rerun sees an echo). Use the box + button "
    "to push a genuine *external* value: it overwrites the editor and bumps the "
    "revision."
)

if "doc" not in st.session_state:
    st.session_state["doc"] = "# External\n\nEdit me — your text sticks."

pushed = st.text_input("External value to push")
if st.button("Push to editor") and pushed:
    st.session_state["doc"] = pushed

# Feed the editor's own output back in as `value`: between edits value == the
# editor's last output, so equivalent() sees an echo and leaves edits alone.
out = st_markdown_editor(
    st.session_state["doc"], key="reconcile", equivalent=lambda c, cur: c == cur
)
st.session_state["doc"] = out

st.markdown("**Raw return:**")
st.code(out, language="markdown")
