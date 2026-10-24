import { test, expect } from '@playwright/test'
import { launchTestApp, TestAppContext } from '../helpers/electron-app'

test.describe('PhotoSort Clean Up Workflows Suite', () => {
  let appCtx: TestAppContext

  test.beforeAll(async () => {
    appCtx = await launchTestApp()
  })

  test.afterAll(async () => {
    if (appCtx) {
      await appCtx.close()
    }
  })

  test('Duplicates View: triggers scan and handles UI controls', async () => {
    const { page, errors } = appCtx

    const duplicatesNav = page.locator('button.sidebar-nav-item:has-text("Duplicates")')
    await duplicatesNav.click()
    await page.waitForTimeout(400)

    const scanBtn = page.locator('.app-content button:has-text("Scan Duplicates")').first()
    if (await scanBtn.isVisible()) {
      await scanBtn.click()
      await page.waitForTimeout(500)
    }

    const errorBoundary = page.locator('.error-boundary-container')
    await expect(errorBoundary).not.toBeVisible()
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Screenshots View: triggers scan without errors', async () => {
    const { page, errors } = appCtx

    const screenshotsNav = page.locator('button.sidebar-nav-item:has-text("Screenshots")')
    await screenshotsNav.click()
    await page.waitForTimeout(400)

    const scanBtn = page.locator('.app-content button:has-text("Scan Screenshots")').first()
    if (await scanBtn.isVisible()) {
      await scanBtn.click()
      await page.waitForTimeout(500)
    }

    const errorBoundary = page.locator('.error-boundary-container')
    await expect(errorBoundary).not.toBeVisible()
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Large Files View: triggers scan, toggles threshold pills and media segments', async () => {
    const { page, errors } = appCtx

    const largeFilesNav = page.locator('button.sidebar-nav-item:has-text("Large Files")')
    await largeFilesNav.click()
    await page.waitForTimeout(400)

    // Trigger scan
    const scanBtn = page.locator('.app-content button:has-text("Scan Large Files"), .app-content button:has-text("Rescan")').first()
    if (await scanBtn.isVisible()) {
      await scanBtn.click()
      await page.waitForTimeout(600)
    }

    // Toggle threshold pills if available
    const pills = page.locator('.app-content button:has-text(">")')
    const count = await pills.count()
    for (let i = 0; i < Math.min(count, 4); i++) {
      await pills.nth(i).click()
      await page.waitForTimeout(200)
    }

    // Toggle media segments (Videos / Photos / All)
    const videoSegment = page.locator('.apple-segment-btn:has-text("Videos")')
    if (await videoSegment.isVisible()) {
      await videoSegment.click()
      await page.waitForTimeout(200)
    }

    const photoSegment = page.locator('.apple-segment-btn:has-text("Photos")')
    if (await photoSegment.isVisible()) {
      await photoSegment.click()
      await page.waitForTimeout(200)
    }

    const allSegment = page.locator('.apple-segment-btn:has-text("All")')
    if (await allSegment.isVisible()) {
      await allSegment.click()
      await page.waitForTimeout(200)
    }

    const errorBoundary = page.locator('.error-boundary-container')
    await expect(errorBoundary).not.toBeVisible()
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Social Media View: triggers scan and switches category tabs', async () => {
    const { page, errors } = appCtx

    const socialNav = page.locator('button.sidebar-nav-item:has-text("Social Media")')
    await socialNav.click()
    await page.waitForTimeout(400)

    const scanBtn = page.locator('.app-content button:has-text("Scan Social Media")').first()
    if (await scanBtn.isVisible()) {
      await scanBtn.click()
      await page.waitForTimeout(600)
    }

    // Click category filter tabs if visible
    const filterTabs = page.locator('.social-media-tab, .apple-segment-btn')
    const tabCount = await filterTabs.count()
    for (let i = 0; i < Math.min(tabCount, 3); i++) {
      await filterTabs.nth(i).click().catch(() => {})
      await page.waitForTimeout(200)
    }

    const errorBoundary = page.locator('.error-boundary-container')
    await expect(errorBoundary).not.toBeVisible()
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Trash View: loads and renders empty state controls cleanly', async () => {
    const { page, errors } = appCtx

    const trashNav = page.locator('button.sidebar-nav-item:has-text("Trash")')
    await trashNav.click()
    await page.waitForTimeout(400)

    const container = page.locator('.photos-page-container, .trash-page-container, .apple-empty-state-card')
    await expect(container.first()).toBeVisible()

    const errorBoundary = page.locator('.error-boundary-container')
    await expect(errorBoundary).not.toBeVisible()
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })
})
