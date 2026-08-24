# Contributing

Thanks for contributing to `streamlit-markdown-editor`. This assumes you're
comfortable with the usual Python open-source workflow and focuses on what's
specific to this repo. By participating you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## How to contribute

Work on a fork (or a branch, if you have write access) → PR against `main`.
`main` is protected: CI must pass and a maintainer merges. New here? Start from
the [issue tracker](https://github.com/jaral-labs/streamlit-markdown-editor/issues)
and look for `good first issue`.

The repo-specific things worth knowing up front:

- **PRs are squash-merged, so the PR _title_ must be a Conventional Commit**
  (`feat:`, `fix:`, `docs:`, …). The title becomes the commit release-please reads
  to decide the version bump; individual commit messages are discarded.
- **All CI jobs are required** before merge: lint/type/security, the test matrix,
  frontend, integration, and **e2e**.
- Branches follow `type/short-description` (e.g. `feat/inline-images`). Reference
  the issue in the PR (`Closes #123`); merged branches are auto-deleted.

## Prerequisites

- **Python ≥ 3.10** and **[uv](https://docs.astral.sh/uv/)**.
- **Node** per [`frontend/.nvmrc`](frontend/.nvmrc) (`nvm use` in `frontend/`).

## Project layout

A src-layout package with a bundled TypeScript frontend:

```
src/streamlit_markdown_editor/   the Python package (the shipped wheel)
frontend/                        editor frontend (Milkdown + CodeMirror 6, Vite)
frontend/build/                  built bundle — git-ignored, force-included into the wheel
examples/app.py                  runnable Streamlit demo
tests/  tests/integration/  tests/e2e/    unit / packaged-component / Playwright
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how it fits together.

## Setup

```bash
uv sync                                   # Python: venv + dev tools
cd frontend && npm ci && npm run build    # build the frontend bundle
uv run pre-commit install                 # optional: run the gates on commit
```

The frontend bundle (`frontend/build/`) is git-ignored — rebuild it after any
frontend change, and note it must exist before building a wheel or running the
integration/e2e tests.

## Quality gates

CI runs these; run them locally before pushing.

Backend:

```bash
uv run ruff check .
uv run ruff format --check .
uv run mypy
uv run bandit -c pyproject.toml -r src
uv run pytest                             # 85% coverage gate
```

Frontend (from `frontend/`):

```bash
npm run typecheck && npm run lint && npm run format:check && npm run security && npm test
```

`.pre-commit-config.yaml` wires ruff, ruff-format, mypy, bandit, and the standard
hygiene hooks.

## Tests

- **Unit** — `uv run pytest`.
- **Integration** — `uv run pytest tests/integration/ --no-cov`: builds a wheel,
  installs it into a clean venv, and mounts the component under `AppTest`. Skips
  if the frontend bundle hasn't been built.
- **e2e** — Playwright against the live app (see below).

The component only registers from a **wheel** install, not an editable one — the
in-package manifest and the frontend bundle exist only inside the built wheel.
So the demo and the e2e suite run against a wheel in a dedicated venv:

```bash
uv build --wheel
uv venv .venv-demo
uv pip install --python .venv-demo/bin/python dist/*.whl
```

```bash
# the demo
source .venv-demo/bin/activate && streamlit run examples/app.py
# the e2e suite (config auto-detects .venv-demo, or set STREAMLIT_BIN)
cd tests/e2e && npm install && npx playwright install chromium && npx playwright test
```

## Releases

Commit and PR-title types follow
[Conventional Commits](https://www.conventionalcommits.org/). `feat:` and `fix:`
are releasing — both a **patch** pre-1.0 (`bump-patch-for-minor-pre-major`); every
other type is not.

- **[release-please](.github/workflows/release-please.yml)** maintains a standing
  release PR that bumps the version (`pyproject.toml`, `__init__.py`) and updates
  `CHANGELOG.md` from the conventional commits since the last release.
- **Merging that PR** creates the `vX.Y.Z` tag and GitHub Release. release-please
  runs with an org-admin PAT (`RELEASE_PLEASE_TOKEN`) because the org
  `protect-release-tags` ruleset restricts tag creation to admins.
- The Release triggers **[publish.yml](.github/workflows/publish.yml)**: PyPI
  trusted publishing (OIDC) to TestPyPI on every release, and PyPI gated behind
  the `pypi` deployment environment (manual approval).
