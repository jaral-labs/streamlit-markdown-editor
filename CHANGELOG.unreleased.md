<!--
Staged 0.0.1 changelog prose.

This curated summary was removed from CHANGELOG.md when the version was rolled
back to 0.0.0 so release-please owns the 0.0.1 cut. release-please generates a
thin entry from commit subjects (feat/fix only by default), so it will NOT
reproduce this narrative. Paste the section below into release-please's 0.0.1
release PR (under its generated `## [0.0.1]` heading), then delete this file.

Not read by release-please — it only updates CHANGELOG.md.
-->

### Added

- Dual-mode markdown editor frontend (Milkdown + CodeMirror 6): a rich WYSIWYG
  surface and a raw CommonMark source view, kept in sync over a single canonical
  markdown string — markdown in, markdown out.
- Mode toggle with lazy re-sync of the inactive surface and best-effort caret
  carry across modes (top-level block index as the shared currency).
- Debounced outbound updates with flush-on-blur, and revision-gated inbound
  reconciliation so external updates don't clobber an in-progress edit.
- Streamlit v2 custom-component frontend built with Vite (reactless), styled in
  a shadow root and theme-aware via Streamlit CSS custom properties.
- Packaging skeleton: hatchling build with a src-layout, Python ≥ 3.10,
  Streamlit ≥ 1.60.
- Quality and security tooling: ruff, mypy, pytest (coverage gate), and bandit
  on the backend; ESLint (with eslint-plugin-security), Prettier, Vitest, and
  npm audit on the frontend; GitHub Actions CI covering both; pre-commit hooks.
