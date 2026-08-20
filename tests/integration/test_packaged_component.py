"""Integration: the packaged component registers through a real runtime.

The unit tests mock the Streamlit boundary. This one builds the wheel, installs
it into a clean venv, and runs the component under Streamlit's ``AppTest`` — the
only way to exercise the real manifest / ``asset_dir`` discovery, which needs an
*installed* (non-editable) package (the editable ``src`` tree has neither the
in-package manifest nor the frontend bundle). Slow; marked ``integration``.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
_FRONTEND_BUILD = _REPO_ROOT / "frontend" / "build"

# Runs inside the clean venv: mounts the component under AppTest and checks both
# that it registers (no app-level exception — a missing manifest/asset_dir would
# raise here) and that its return round-trips through the real runtime (first
# render echoes the input markdown back).
_APP_DRIVER = '''\
import sys
from streamlit.testing.v1 import AppTest

APP = """
import streamlit as st
from streamlit_markdown_editor import st_markdown_editor
st.session_state["out"] = st_markdown_editor("# Hi", key="e")
"""

at = AppTest.from_string(APP)
at.run()

exceptions = [str(e.value) for e in at.exception]
if exceptions:
    print("APPTEST_EXCEPTIONS:", exceptions)
    sys.exit(1)

out = at.session_state["out"]
if out != "# Hi":
    print("APPTEST_RETURN_MISMATCH:", repr(out))
    sys.exit(1)

print("APPTEST_OK")
'''


def _run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        cmd, cwd=cwd, capture_output=True, text=True, timeout=300, check=False
    )
    if proc.returncode != 0:
        pytest.fail(f"command failed: {' '.join(cmd)}\n{proc.stdout}\n{proc.stderr}")
    return proc


def test_installed_wheel_registers_under_apptest(tmp_path: Path) -> None:
    """Slow: builds the wheel, creates a fresh venv, and installs into it.

    Because it shells out to a wheel build, a virtual-environment creation, and a
    wheel install before running the component, this takes seconds rather than
    the milliseconds of the mocked unit tests.
    """
    if shutil.which("uv") is None:
        pytest.skip("uv not on PATH")
    if not list(_FRONTEND_BUILD.glob("index-*.js")):
        pytest.skip("frontend bundle not built (run `npm run build` in frontend/)")

    # Build the wheel into an isolated dir (uses the already-built frontend).
    dist = tmp_path / "dist"
    _run(["uv", "build", "--wheel", "--out-dir", str(dist)], cwd=_REPO_ROOT)
    wheels = list(dist.glob("*.whl"))
    assert wheels, "no wheel produced"

    # Inspect the wheel: the frontend bundle must be packaged inside it, at the
    # in-package path the component manifest's asset_dir points to.
    with zipfile.ZipFile(wheels[0]) as zf:
        names = zf.namelist()
    assert any(
        n.startswith("streamlit_markdown_editor/frontend/index-") and n.endswith(".js")
        for n in names
    ), names

    # Clean venv, activated in the shell for the install and the AppTest run.
    venv = tmp_path / "venv"
    _run(["uv", "venv", "--python", sys.executable, str(venv)])
    activate = venv / "bin" / "activate"

    def _in_venv(command: str) -> subprocess.CompletedProcess[str]:
        return _run(["bash", "-c", f"source '{activate}' && {command}"])

    _in_venv(f"uv pip install '{wheels[0]}'")

    # Mount the packaged component under AppTest, with the venv activated.
    driver = tmp_path / "driver.py"
    driver.write_text(_APP_DRIVER)
    result = _in_venv(f"python '{driver}'")
    assert "APPTEST_OK" in result.stdout, result.stdout + result.stderr
