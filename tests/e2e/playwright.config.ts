import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * End-to-end tests that drive the live Streamlit demo (`examples/app.py`) in a
 * real browser — the only place the component's frontend behaviour (mount, mode
 * toggle, inbound reconcile) is exercised for real. The unit tests and AppTest
 * integration test cover the Python boundary; this covers the editor itself.
 *
 * The app MUST be served from a *wheel* install of the package, not an editable
 * one: component discovery needs the in-package manifest + frontend bundle that
 * only exist inside the built wheel. Point `STREAMLIT_BIN` at that env's
 * `streamlit` (CI does). Locally, activate the wheel venv (e.g. `.venv-demo`) so
 * plain `streamlit` is on PATH, then `npx playwright test`.
 */
const PORT = Number(process.env.E2E_PORT ?? 8501)
const BASE_URL = `http://localhost:${PORT}`

// Resolve the streamlit binary. Explicit STREAMLIT_BIN wins (CI sets it to the
// wheel venv). Otherwise prefer the local wheel venv `.venv-demo` if present, so
// a bare `npx playwright test` works without activating it; else fall back to
// whatever `streamlit` is on PATH.
const localWheelStreamlit = resolve(__dirname, '../../.venv-demo/bin/streamlit')
const STREAMLIT =
  process.env.STREAMLIT_BIN ??
  (existsSync(localWheelStreamlit) ? localWheelStreamlit : 'streamlit')

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `${STREAMLIT} run ../../examples/app.py --server.port=${PORT} --server.headless=true --browser.gatherUsageStats=false`,
    cwd: __dirname,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
