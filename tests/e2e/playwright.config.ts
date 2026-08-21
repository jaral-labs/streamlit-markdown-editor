import { defineConfig, devices } from '@playwright/test'

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
const STREAMLIT = process.env.STREAMLIT_BIN ?? 'streamlit'

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
