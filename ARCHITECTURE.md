# Architecture

Design notes for contributors: how the editor is built, how data crosses the
Python ↔ JavaScript boundary, and how the component is packaged and registered.
For setup and workflow, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Overview

`streamlit-markdown-editor` is a Streamlit v2 component: a small Python wrapper
(`st_markdown_editor`) around a pre-built TypeScript frontend. It is
**markdown-in, markdown-out** — the caller passes markdown and gets the (possibly
edited) markdown back — with a dual-mode editing surface: a WYSIWYG view and a
raw CommonMark view that stay in sync.

```
Python                         │ frontend (shadow root)
                               │
st_markdown_editor(value=…) ───┼──▶ data.value ──▶ ┌─────────────┐
                               │                   │  canonical  │
   returns edited markdown ◀───┼── setState ─────  │   string    │
                               │                   └──────┬──────┘
                               │                   ┌──────┴──────┐
                               │      WYSIWYG ◀────▶│  toggle     │◀───▶ raw
                               │     (Milkdown)     └─────────────┘  (CodeMirror 6)
```

## The editor: two surfaces, one canonical string

The WYSIWYG surface is **[Milkdown](https://github.com/Milkdown/milkdown)** and the
raw surface is **[CodeMirror 6](https://github.com/codemirror)**. They
are separate editors with fundamentally different in-memory models — Milkdown
holds a ProseMirror document tree, CodeMirror holds a plain-text string — and
**no shared document object**. A single canonical CommonMark string is the source
of truth; every mode crossing is a serialize-out / parse-in over that string.

Milkdown is WYSIWYG-only, which is why the raw surface is a second editor we own
and sync, rather than one library toggling itself. Milkdown serializes through
**remark**, so its output is structurally canonical markdown; the raw surface is
lossless by construction because its document *is* the string. Round-trip
fidelity therefore concentrates in one place (Milkdown/remark) and is verified
independently.

### Lazy, one-way sync

- Each surface's change event updates the canonical string and sets a `dirty`
  flag. The **inactive surface is never live-synced** — doing so would pay the
  parse/serialize cost on every keystroke, work an invisible surface, and invite
  feedback loops.
- On a mode switch, the target surface is rehydrated from the canonical string
  **only if `dirty`** (otherwise it is shown as-is). Switches are user-paced and
  infrequent, so the parse → rebuild work happens only when it is observable.

### Cursor carry across a switch

The caret is carried at **line/column granularity**, best-effort, not
character-exact. Markdown source offsets and ProseMirror positions have no
bijection (syntax characters vs. node boundaries), and reformatting shifts
offsets, so a char-exact mapping is neither achievable nor worth it. The mapping
uses remark mdast node positions (line/column/offset); where a mapping isn't
available it clamps to a valid position and accepts the caret resetting to the
start of the block. This is a deliberate UX tradeoff in favor of robustness.

## Crossing the Python ↔ JS boundary

Data crosses through two keys that mirror `frontend/src/index.ts`:

- **`value` (Python → JS):** the markdown the editor should load, sent via `data`.
- **`markdown` (JS → Python):** the edited markdown the frontend reports back as a
  persistent state value.

### Outbound (edits → Python)

The canonical string is pushed to Python via the component's `setState`,
**debounced** so an editing burst produces one rerun per pause rather than one per
keystroke. Focus leaving the component **flushes** any pending push immediately,
so an edit is never stranded when the user clicks away.

### Inbound reconciliation

The renderer is re-invoked on every Streamlit rerun, so the frontend must decide
whether an inbound `value` is a **genuine external change** (adopt it) or the
**echo of its own last output** (ignore it, to preserve in-progress edits). Naive
byte-equality (`value !== held`) breaks for any consumer that canonicalizes the
markdown between reruns — e.g. reformatting it — because the reformatted echo then
looks "external" on every cycle, re-hydrating the editor and clobbering the
cursor.

The design splits the decision across the boundary:

- **Frontend: `revision`-gated.** `data` may carry an optional `revision` nonce.
  When present, the frontend treats an inbound `value` as external **only when
  `revision` changes**; when absent, it falls back to byte-equality. The frontend
  holds no consumer-specific logic — it just obeys the nonce.
- **Python: an optional `equivalent(candidate, current) -> bool` callback.** The
  wrapper tracks the editor's last output (in `st.session_state`) and uses the
  callback — the consumer's own notion of equality — to decide echo-vs-external,
  **bumping `revision` only on a genuine external change**. Omitted → byte-equality.

Criteria live in Python because that is where a consumer's canonicalizer already
lives, and because a JavaScript callback cannot be passed from Python into a
Streamlit component — so the verdict travels as **data** (the nonce), not code.
`equivalent` requires a `key` (the wrapper needs somewhere to track the last
output); passing `equivalent` without `key` raises `StreamlitAPIException`.

## Packaging & registration

This is the part most specific to Streamlit v2 components, and the most common
place a component silently ships broken.

### Shipping the frontend bundle

The frontend is built by Vite into `frontend/build/` — a **git-ignored build
artifact**, never committed. hatchling's default file selection honors
`.gitignore`, so without help the wheel would build and publish successfully
**with no frontend at all**. Three `force-include` entries in `pyproject.toml` fix
this:

- `frontend/build` → `streamlit_markdown_editor/frontend` — the built bundle,
  placed inside the installed package.
- `pyproject.toml` → `streamlit_markdown_editor/pyproject.toml` — the component
  **manifest**, shipped *inside* the package (see below).
- `THIRD_PARTY_LICENSES.txt` → `streamlit_markdown_editor/THIRD_PARTY_LICENSES.txt`
  — the third-party license notice (see below).

Because `force-include` runs during editable/dev installs too (`uv sync`, a fresh
checkout), and `frontend/build` may not exist there, a small custom build hook
(`src/hatch_build.py`) creates the directory first so those installs don't fail
on a missing source. A real distribution wheel still receives the actual bundle
once the frontend has been built, and CI asserts the assets landed.

### Third-party license notice

The bundle inlines Milkdown, CodeMirror 6, and their transitive npm dependencies,
so the wheel **redistributes** that (MIT/BSD/ISC-licensed) code — which obliges us
to ship those packages' license notices with it. `THIRD_PARTY_LICENSES.txt` is
generated from the actual bundle by `rollup-plugin-license` (via `npm run
licenses`, gated on `GEN_LICENSES=1` so ordinary builds don't churn it), committed
at the repo root for visibility, and force-included into the wheel for compliance.
CI regenerates it and fails if the committed copy is stale, and `publish.yml`
refuses to publish a wheel that is missing it.

### The component manifest

Streamlit v2 has no `declare_component(path=…)`; instead it discovers components
by scanning installed distributions for a `pyproject.toml` that declares
`[[tool.streamlit.component.components]]`. Two consequences shape the packaging:

- The **repo-root `pyproject.toml` is never installed**, so the manifest is
  force-included *into* the package (`streamlit_markdown_editor/pyproject.toml`).
  It carries `[project].name`, which the scanner requires to attribute the
  manifest to this distribution.
- `asset_dir = "frontend"` resolves against the **installed package root**
  (`streamlit_markdown_editor/`), so it names the force-included bundle
  directory, not the repo-relative source path. The bundle is referenced by the
  glob `index-*.js` because Vite content-hashes the filename.

The component key Streamlit builds is `"<[project].name>.<component name>"`, i.e.
`"streamlit-markdown-editor.streamlit_markdown_editor"`, which the Python side
passes through verbatim — it must match the manifest exactly or the file-backed
`js` fails to resolve its `asset_dir`.

### Lazy registration

The component is registered **on first use, not at import time**, and the
renderer is memoized. The file-backed `js` glob is validated the moment
`st.components.v2.component(...)` is called, against the manifest's `asset_dir`,
which Streamlit only discovers during `streamlit run` setup. Registering at
import would raise `StreamlitAPIException` on a bare `import
streamlit_markdown_editor` (in tests, tooling, any non-app context), making the
package unimportable outside a running app. Deferring to first render means the
manifest is already discovered by the time we register.

A practical corollary, which the tests and CI enforce: the component only mounts
from a **wheel install**, not an editable one — the in-package manifest and the
frontend bundle exist only inside the built wheel, not in the editable `src/`
tree.

### Layout & versioning

The package uses a **src-layout** (`packages = ["src/streamlit_markdown_editor"]`)
and a **static, single-source `[project].version`**. The version is bumped in
lockstep across `pyproject.toml` and `__init__.py` by the release automation
(see [CONTRIBUTING.md](CONTRIBUTING.md)); a CI check guards that a release tag
matches the declared version, which is only meaningful because the version is
static rather than derived from the tag.
