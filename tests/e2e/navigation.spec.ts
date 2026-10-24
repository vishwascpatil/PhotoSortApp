import { test, expect } from '@playwright/test'
import { launchTestApp, TestAppContext } from '../helpers/electron-app'

test.describe('PhotoSort Sidebar Navigation & Layout Suite', () => {
  let appCtx: TestAppContext

  test.beforeAll(async () => {
    appCtx = await launchTestApp()
  })

  test.afterAll(async () => {
    if (appCtx) {
      await appCtx.close()
    }
  })

  test('Application launches and renders without critical errors', async () => {
    const { page, errors } = appCtx
    const root = page.locator('#root')
    await expect(root).toBeVisible()

    // If on Welcome screen, click 'Get Started' to enter the app
    const getStartedBtn = page.locator('button:has-text("Get Started")')
    if (await getStartedBtn.isVisible()) {
      await getStartedBtn.click()
      await page.waitForSelector('aside.sidebar', { timeout: 10000 })
    }

    expect(errors.filter(e => !e.includes('net::ERR_FILE_NOT_FOUND'))).toHaveLength(0)
  })

  test('TopBar controls: toggle theme, grid density, and sidebar collapse', async () => {
    const { page } = appCtx

    // 1. Toggle Sidebar Collapse
    const hamburgerBtn = page.locator('button.topbar-btn[title="Toggle sidebar"]')
    if (await hamburgerBtn.isVisible()) {
      await hamburgerBtn.click()
      await page.waitForTimeout(300)
      const sidebar = page.locator('aside.sidebar')
      await expect(sidebar).toHaveClass(/collapsed/)

      // Toggle back
      await hamburgerBtn.click()
      await page.waitForTimeout(300)
      await expect(sidebar).not.toHaveClass(/collapsed/)
    }

    // 2. Toggle Theme (Light / Dark)
    const themeBtn = page.locator('button.topbar-btn[title="Toggle theme"]')
    if (await themeBtn.isVisible()) {
      await themeBtn.click()
      await page.waitForTimeout(300)
      await themeBtn.click()
      await page.waitForTimeout(300)
    }

    // 3. Toggle Grid Density
    const gridDensityBtn = page.locator('button.topbar-btn[title^="Grid density"]')
    if (await gridDensityBtn.isVisible()) {
      await gridDensityBtn.click()
      await page.waitForTimeout(200)
      await gridDensityBtn.click()
      await page.waitForTimeout(200)
    }
  })

  test('Can navigate to every section in Sidebar without errors', async () => {
    const { page, errors } = appCtx

    const navTargets = [
      { label: 'All Photos', expectedTitleMatch: /Photo|All Photos|No Photos|Empty/i },
      { label: 'Favorites', expectedTitleMatch: /Favorites|Favorite/i },
      { label: 'Videos', expectedTitleMatch: /Videos|Video/i },
      { label: 'People', expectedTitleMatch: /People|Faces|Person/i },
      { label: 'Places', expectedTitleMatch: /Places|Locations|Map/i },
      { label: 'Documents', expectedTitleMatch: /Documents|Document/i },
      { label: 'Duplicates', expectedTitleMatch: /Duplicates|Duplicate/i },
      { label: 'Screenshots', expectedTitleMatch: /Screenshots|Screenshot/i },
      { label: 'Large Files', expectedTitleMatch: /Large Files|Size/i },
      { label: 'Social Media', expectedTitleMatch: /Social Media|Junk/i },
      { label: 'Trash', expectedTitleMatch: /Trash|Bin/i },
      { label: 'Imported Folders', expectedTitleMatch: /Imported Folders|Folders/i }
    ]

    for (const target of navTargets) {
      const navItem = page.locator(`button.sidebar-nav-item:has-text("${target.label}")`).first()
      if (await navItem.isVisible()) {
        await navItem.click()
        await page.waitForTimeout(400)

        // Verify no crash / React error boundary triggered
        const errorBoundary = page.locator('.error-boundary-container')
        await expect(errorBoundary).not.toBeVisible()

        // Verify page content rendered
        const pageContent = page.locator('.app-layout, .photos-page-container, .folders-page-container, .overview-container')
        await expect(pageContent.first()).toBeVisible()
      }
    }

    // Assert zero uncaught page errors occurred during full navigation cycle
    const criticalErrors = errors.filter(e => e.startsWith('[PAGE_ERROR]'))
    expect(criticalErrors).toHaveLength(0)
  })
})
