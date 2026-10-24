import { test, expect } from '@playwright/test'
import { launchTestApp, TestAppContext } from '../helpers/electron-app'

test.describe('PhotoSort Organize & Export Modal Suite', () => {
  let appCtx: TestAppContext

  test.beforeAll(async () => {
    appCtx = await launchTestApp()
  })

  test.afterAll(async () => {
    if (appCtx) {
      await appCtx.close()
    }
  })

  test('Organize & Export modal opens from sidebar and handles mode switching', async () => {
    const { page, errors } = appCtx

    // 1. Click Organize & Export in Sidebar
    const organizeBtn = page.locator('button.sidebar-organize-btn')
    await expect(organizeBtn).toBeVisible()
    await organizeBtn.click()
    await page.waitForTimeout(500)

    // 2. Modal overlay must appear
    const modalOverlay = page.locator('.folder-export-modal-overlay, .modal-backdrop, .modal-overlay')
    await expect(modalOverlay.first()).toBeVisible()

    // 3. Mode Toggle (Copy Mode vs Move Mode)
    const copyRadio = page.locator('button, label, input').filter({ hasText: /Copy/i }).first()
    if (await copyRadio.isVisible()) {
      await copyRadio.click()
      await page.waitForTimeout(200)
    }

    const moveRadio = page.locator('button, label, input').filter({ hasText: /Move/i }).first()
    if (await moveRadio.isVisible()) {
      await moveRadio.click()
      await page.waitForTimeout(200)
    }

    // 4. Close the modal via Close / Cancel button
    const closeBtn = page.locator('button.modal-close-btn, button[aria-label="Close modal"], button:has-text("Cancel"), button:has-text("Close")').first()
    if (await closeBtn.isVisible()) {
      await closeBtn.click()
      await page.waitForTimeout(400)
    } else {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }

    // 5. Verify modal overlay closed
    await expect(modalOverlay.first()).not.toBeVisible()

    // Verify zero fatal page errors
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })
})
