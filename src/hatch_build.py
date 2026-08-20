"""Hatch build hook: ensure the force-included frontend directory exists.

The wheel and sdist force-include ``frontend/build`` — a gitignored build
artifact. When it is absent (an editable/dev install via ``uv sync``, or a
checkout without a frontend build), hatchling's force-include raises
``FileNotFoundError`` and the build fails before any file is collected.

Creating the directory (empty if the frontend has not been built) lets those
builds succeed without coupling the editable/dev install to a frontend build. A
real distribution wheel still receives the actual bundle when ``npm run build``
has run, and the CI wheel-content guard catches an empty one.

Lives under ``src/`` (not the repo root, hatchling's default) so the project's
file-placement conventions permit it; ``[tool.hatch.build.hooks.custom].path``
in ``pyproject.toml`` points hatchling here. ``self.root`` is still the repo
root, so the created directory is repo-root ``frontend/build`` regardless.
"""

import os

from hatchling.builders.hooks.plugin.interface import (  # type: ignore[import-not-found]
    BuildHookInterface,
)


class CustomBuildHook(BuildHookInterface):  # type: ignore[misc]
    """Create ``frontend/build`` if missing, so force-include never fails."""

    def initialize(self, version: str, build_data: dict[str, object]) -> None:
        """Ensure the force-include source exists before files are collected."""
        os.makedirs(os.path.join(self.root, "frontend", "build"), exist_ok=True)
