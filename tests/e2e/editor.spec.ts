import { test, expect, type Locator, type Page } from '@playwright/test'

/**
 * Core regression coverage for the live editor. Deliberately the three
 * deterministic behaviours — render/round-trip, mode toggle, external reconcile
 * — that assert reliably. The flakier ones (caret carry, debounce/flush timing,
 * theming) are validated manually and left out of the gating suite on purpose.
 *
 * DOM contract (see src/streamlit_markdown_editor/_scaffold.py): each editor is
 * a `.sme-root` holding a `.sme-toggle` (buttons `[data-mode="wysiwyg"|"raw"]`,
 * active one carries `.sme-active`) and a `.sme-surface` (Milkdown `.ProseMirror`
 * WYSIWYG + CodeMirror `.cm-editor` raw). Streamlit v2 renders the component into
 * an OPEN shadow root, which Playwright's CSS selectors pierce automatically; the
 * surrounding Streamlit widgets (text_input, button, st.code) are light DOM.
 *
 * Panel A (key="basic") is the first `.sme-root`; Panel B (key="reconcile") the
 * second.
 */

const APP_LOADED = /streamlit-markdown-editor — dev harness/

function panel(page: Page, index: number): Locator {
  return page.locator('.sme-root').nth(index)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // Wait for the app shell and at least one mounted editor before asserting.
  await expect(page.getByText(APP_LOADED)).toBeVisible()
  await expect(page.locator('.sme-root').first()).toBeVisible()
})

test('mounts and round-trips the seed markdown (Panel A)', async ({ page }) => {
  const panelA = panel(page, 0)
  // WYSIWYG surface renders the seed "# Hello" as a heading.
  await expect(
    panelA.locator('.ProseMirror').getByRole('heading', { name: 'Hello' }),
  ).toBeVisible()
  // The raw-return echo (st.code of the widget's return) proves the markdown
  // round-tripped through Python unchanged.
  await expect(page.locator('pre', { hasText: '# Hello' }).first()).toBeVisible()
})

test('toggles between WYSIWYG and raw (Panel A)', async ({ page }) => {
  const panelA = panel(page, 0)
  const wysiwyg = panelA.locator('button[data-mode="wysiwyg"]')
  const raw = panelA.locator('button[data-mode="raw"]')

  await expect(wysiwyg).toHaveClass(/sme-active/) // WYSIWYG is the default mode
  await expect(panelA.locator('.ProseMirror')).toBeVisible()

  await raw.click()
  await expect(raw).toHaveClass(/sme-active/)
  await expect(wysiwyg).not.toHaveClass(/sme-active/)
  await expect(panelA.locator('.cm-editor')).toBeVisible() // CodeMirror raw surface

  await wysiwyg.click()
  await expect(wysiwyg).toHaveClass(/sme-active/)
  await expect(panelA.locator('.ProseMirror')).toBeVisible()
})

test('an external push reconciles into the editor (Panel B)', async ({ page }) => {
  const panelB = panel(page, 1)
  await expect(panelB).toBeVisible()

  await page.getByLabel('External value to push').fill('# Pushed value')
  await page.getByRole('button', { name: 'Push to editor' }).click()

  // The editor adopts the external value (revision bump) and the raw-return
  // echoes it — the inbound-reconcile path end to end.
  await expect(
    panelB.locator('.ProseMirror').getByRole('heading', { name: 'Pushed value' }),
  ).toBeVisible()
  await expect(page.locator('pre', { hasText: '# Pushed value' })).toBeVisible()
})
