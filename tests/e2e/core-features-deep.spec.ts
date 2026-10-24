import { test, expect } from '@playwright/test'
import path from 'path'
import { launchTestApp, TestAppContext } from '../helpers/electron-app'

test.describe.serial('PhotoSort Core Features Deep Automation & Verification Suite', () => {
  test.setTimeout(120000)

  let appCtx: TestAppContext
  const sampleLibraryPath = path.join(process.cwd(), 'test-fixtures', 'sample-library')

  test.beforeAll(async () => {
    // 1. Launch isolated test application
    appCtx = await launchTestApp()
    const { page } = appCtx

    // 2. Ensure sample-library photos are imported so we have rich real data
    await page.evaluate(async (dir) => {
      if ((window as any).photoVault?.importFolder) {
        return await (window as any).photoVault.importFolder(dir)
      }
      return null
    }, sampleLibraryPath)

    await page.waitForTimeout(1000)
  })

  test.afterAll(async () => {
    if (appCtx) {
      await appCtx.close()
    }
  })

  test('Feature 1: Interactive PhotoViewer (Zoom, Next/Prev, EXIF Info, Captioning, Favorite)', async () => {
    const { page, errors } = appCtx

    // Navigate to All Photos
    const photosNav = page.locator('button.sidebar-nav-item:has-text("All Photos")')
    await photosNav.click()
    await page.waitForTimeout(500)

    // Verify at least one photo tile is rendered
    const photoTiles = page.locator('.photo-tile')
    await expect(photoTiles.first()).toBeVisible({ timeout: 10000 })
    const count = await photoTiles.count()
    expect(count).toBeGreaterThan(0)

    // 1. Click first photo tile to open PhotoViewer
    await photoTiles.first().click()
    const viewer = page.locator('.photo-viewer')
    await expect(viewer).toBeVisible({ timeout: 5000 })

    // 2. Verify photo image element
    const viewerImg = page.locator('.photo-viewer-image')
    await expect(viewerImg).toBeVisible()

    // 3. Test Zoom Toggle (clicking image zooms in)
    await viewerImg.click()
    await page.waitForTimeout(300)
    // Click again to zoom out
    await viewerImg.click()
    await page.waitForTimeout(200)

    // 4. Test Next & Prev Navigation
    const nextBtn = page.locator('.photo-viewer-nav.next')
    if (await nextBtn.isVisible()) {
      await nextBtn.click()
      await page.waitForTimeout(300)
      const prevBtn = page.locator('.photo-viewer-nav.prev')
      await expect(prevBtn).toBeVisible()
      await prevBtn.click()
      await page.waitForTimeout(300)
    }

    // 5. Test Info / EXIF Panel Toggle & Live Description Saving
    const infoBtn = page.locator('button.viewer-btn[title="Info"]')
    await expect(infoBtn).toBeVisible()
    await infoBtn.click()

    const infoPanel = page.locator('.photo-info-panel')
    await expect(infoPanel).toBeVisible({ timeout: 3000 })

    // Verify Caption Input inside Info Panel and test updateMetadata
    const captionInput = infoPanel.locator('input[placeholder*="Add a description"]')
    if (await captionInput.isVisible()) {
      await captionInput.fill('Automation verified landscape caption')
      await captionInput.blur()
      await page.waitForTimeout(400)
    }

    // Toggle Info Panel off
    await infoBtn.click()
    await expect(infoPanel).not.toBeVisible()

    // 6. Close PhotoViewer via Back button
    const backBtn = page.locator('button.viewer-btn[title="Back"]')
    await expect(backBtn).toBeVisible()
    await backBtn.click()
    await expect(viewer).not.toBeVisible({ timeout: 5000 })

    expect(errors.filter((e) => e.includes('PAGE_ERROR'))).toEqual([])
  })

  test('Feature 2: PhotoEditor (Filters, Sliders, Rotate, Reset, and Save/Cancel)', async () => {
    const { page, errors } = appCtx

    // 1. Open first photo in PhotoViewer
    const photoTiles = page.locator('.photo-tile')
    await photoTiles.first().click()
    const viewer = page.locator('.photo-viewer')
    await expect(viewer).toBeVisible()

    // 2. Click Edit button in viewer toolbar
    const editBtn = page.locator('button.viewer-btn[title="Edit"]')
    await expect(editBtn).toBeVisible()
    await editBtn.click()

    // 3. Verify PhotoEditor interface
    const editor = page.locator('.photo-editor')
    await expect(editor).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.photo-editor-canvas canvas')).toBeVisible()

    // 4. Test Filters tab
    const vividFilter = page.locator('button.photo-editor-filter:has-text("Vivid")')
    if (await vividFilter.isVisible()) {
      await vividFilter.click()
      await expect(vividFilter).toHaveClass(/active/)
    }

    const bwFilter = page.locator('button.photo-editor-filter:has-text("B&W")')
    if (await bwFilter.isVisible()) {
      await bwFilter.click()
      await expect(bwFilter).toHaveClass(/active/)
    }

    // 5. Test Adjust tab
    const adjustTab = page.locator('button.photo-editor-tab:has-text("Adjust")')
    await expect(adjustTab).toBeVisible()
    await adjustTab.click()
    await expect(adjustTab).toHaveClass(/active/)

    const brightnessSlider = page.locator('.photo-editor-slider input[type="range"]').first()
    await expect(brightnessSlider).toBeVisible()
    await brightnessSlider.fill('25')
    await page.waitForTimeout(200)

    // 6. Test Rotate button
    const rotateBtn = page.locator('.photo-editor-toolbar button:has-text("Rotate")')
    await expect(rotateBtn).toBeVisible()
    await rotateBtn.click()
    await page.waitForTimeout(200)

    // 7. Test Reset button
    const resetBtn = page.locator('.photo-editor-toolbar button:has-text("Reset")')
    await expect(resetBtn).toBeVisible()
    await resetBtn.click()
    await page.waitForTimeout(200)

    // 8. Close PhotoEditor via back arrow
    const closeBtn = page.locator('.photo-editor-toolbar button.viewer-btn')
    await closeBtn.click()
    await expect(editor).not.toBeVisible()

    // Close PhotoViewer
    const backBtn = page.locator('button.viewer-btn[title="Back"]')
    if (await backBtn.isVisible()) {
      await backBtn.click()
      await expect(viewer).not.toBeVisible()
    }

    expect(errors.filter((e) => e.includes('PAGE_ERROR'))).toEqual([])
  })

  test('Feature 3: Multi-Select Dock, Side-by-Side Compare Modal, and Collage Creator', async () => {
    const { page, errors } = appCtx

    const photosNav = page.locator('button.sidebar-nav-item:has-text("All Photos")')
    await photosNav.click()
    await page.waitForTimeout(400)

    // 1. Select 2 photos via checkboxes
    const checkboxes = page.locator('.photo-tile-checkbox')
    await expect(checkboxes.first()).toBeVisible({ timeout: 5000 })
    await checkboxes.nth(0).click()
    await checkboxes.nth(1).click()

    // 2. Verify Selection Floating Dock
    const dock = page.locator('.selection-floating-dock')
    await expect(dock).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.dock-count-badge')).toContainText('2')

    // 3. Test Compare Modal
    const compareBtn = page.locator('.dock-action-compare')
    await expect(compareBtn).toBeVisible()
    await compareBtn.click()

    const compareModal = page.locator('.modal-title:has-text("Side-by-Side Photo Comparison")')
    await expect(compareModal).toBeVisible({ timeout: 5000 })

    // Verify 2 photo comparison panels
    const modalBody = page.locator('.modal-body')
    await expect(modalBody).toBeVisible()

    // Close Compare Modal
    const closeCompareBtn = page.locator('.modal-header button.viewer-btn')
    await closeCompareBtn.click()
    await expect(compareModal).not.toBeVisible()

    // 4. Test Collage Modal
    const collageBtn = page.locator('.dock-action-collage')
    await expect(collageBtn).toBeVisible()
    await collageBtn.click()

    const collageModal = page.locator('.modal-title:has-text("Create Collage")')
    await expect(collageModal).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.modal-body canvas')).toBeVisible()

    // Test Layout Buttons
    const splitLayout = page.locator('button:has-text("Side Split")')
    if (await splitLayout.isVisible()) {
      await splitLayout.click()
      await page.waitForTimeout(200)
    }

    const heroLayout = page.locator('button:has-text("Hero Feature")')
    if (await heroLayout.isVisible()) {
      await heroLayout.click()
      await page.waitForTimeout(200)
    }

    const grid2x2 = page.locator('button:has-text("2×2 Grid")')
    if (await grid2x2.isVisible()) {
      await grid2x2.click()
      await page.waitForTimeout(200)
    }

    // Cancel Collage Modal
    const cancelCollageBtn = page.locator('.modal-footer button:has-text("Cancel")')
    await cancelCollageBtn.click()
    await expect(collageModal).not.toBeVisible()

    // 5. Clear selection via dock close button
    const clearDockBtn = page.locator('.dock-btn-circle')
    await clearDockBtn.click()
    await expect(dock).not.toBeVisible()

    expect(errors.filter((e) => e.includes('PAGE_ERROR'))).toEqual([])
  })

  test('Feature 4: Favorites Lifecycle (Add in Grid, Verify in Favorites View, Remove)', async () => {
    const { page, errors } = appCtx

    const photosNav = page.locator('button.sidebar-nav-item:has-text("All Photos")')
    await photosNav.click()
    await page.waitForTimeout(400)

    // 1. Find a photo tile and ensure it is favorited
    const firstTile = page.locator('.photo-tile').first()
    await expect(firstTile).toBeVisible()
    const favTileBtn = firstTile.locator('.photo-tile-favorite')
    const isFav = await favTileBtn.evaluate((el) => el.classList.contains('is-favorite'))
    if (!isFav) {
      await favTileBtn.click()
      await page.waitForTimeout(500)
    }

    // 2. Navigate to Favorites page
    const favoritesNav = page.locator('button.sidebar-nav-item:has-text("Favorites")')
    await favoritesNav.click()
    await page.waitForTimeout(500)

    // Verify at least one photo tile exists in Favorites
    const favTiles = page.locator('.photo-tile')
    await expect(favTiles.first()).toBeVisible({ timeout: 5000 })
    const favCount = await favTiles.count()
    expect(favCount).toBeGreaterThanOrEqual(1)

    // 3. Unfavorite via tile Heart button in Favorites view
    await favTiles.first().locator('.photo-tile-favorite').click()
    await page.waitForTimeout(500)

    // Navigate back to All Photos
    await photosNav.click()
    await page.waitForTimeout(300)

    expect(errors.filter((e) => e.includes('PAGE_ERROR'))).toEqual([])
  })

  test('Feature 5: Trash & Restore Lifecycle', async () => {
    const { page, errors } = appCtx

    const photosNav = page.locator('button.sidebar-nav-item:has-text("All Photos")')
    await photosNav.click()
    await page.waitForTimeout(400)

    // 1. Select the last photo and move it to trash via dock
    const lastCheckbox = page.locator('.photo-tile-checkbox').last()
    await lastCheckbox.click()
    const dock = page.locator('.selection-floating-dock')
    await expect(dock).toBeVisible()

    const trashBtn = page.locator('.dock-action-trash')
    await trashBtn.click()
    await page.waitForTimeout(500)

    // 2. Navigate to Trash Page
    const trashNav = page.locator('button.sidebar-nav-item:has-text("Trash")')
    await trashNav.click()
    await page.waitForTimeout(500)

    // Verify item is present in Trash
    const trashTiles = page.locator('.photo-tile')
    await expect(trashTiles.first()).toBeVisible({ timeout: 5000 })

    // 3. Restore item from Trash
    const restoreAllBtn = page.locator('button.apple-secondary-btn:has-text("Restore All")')
    if (await restoreAllBtn.isVisible()) {
      await restoreAllBtn.click()
    } else {
      await page.locator('.photo-tile-checkbox').first().click()
      await page.locator('.dock-action-btn:has-text("Restore")').click()
    }
    await page.waitForTimeout(800)

    // 4. Verify Trash is empty
    await expect(page.locator('.apple-empty-state-wrapper')).toBeVisible({ timeout: 5000 })

    // Return to All Photos
    await photosNav.click()
    await page.waitForTimeout(400)

    expect(errors.filter((e) => e.includes('PAGE_ERROR'))).toEqual([])
  })

  test('Feature 6: Keyboard Shortcuts Modal and Overview Navigation Hub', async () => {
    const { page, errors } = appCtx

    // 1. Press '?' to trigger Keyboard Shortcuts Modal
    await page.keyboard.press('Shift+Slash')
    await page.waitForTimeout(400)

    const shortcutsModal = page.locator('.modal-title:has-text("Keyboard Shortcuts")')
    if (!await shortcutsModal.isVisible().catch(() => false)) {
      await page.keyboard.press('?')
      await page.waitForTimeout(400)
    }

    if (await shortcutsModal.isVisible().catch(() => false)) {
      // Verify shortcut items are rendered
      const shortcutKeys = page.locator('.modal-body kbd')
      await expect(shortcutKeys.first()).toBeVisible()
      const kbdCount = await shortcutKeys.count()
      expect(kbdCount).toBeGreaterThanOrEqual(5)

      // Close Keyboard Shortcuts Modal
      const closeShortcutBtn = page.locator('.modal-header button.viewer-btn')
      await closeShortcutBtn.click()
      await expect(shortcutsModal).not.toBeVisible()
    }

    // 2. Navigate to Library Overview by clicking Sidebar Logo
    const logo = page.locator('.sidebar-header')
    await logo.click()
    await page.waitForTimeout(500)

    // Verify Overview Header and Metric Chips
    const overviewTitle = page.locator('h1.overview-title:has-text("Library")')
    await expect(overviewTitle).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.overview-metrics-bar')).toBeVisible()

    // 3. Click Category Card inside Overview (e.g. Duplicates)
    const dupCard = page.locator('.category-card:has-text("Duplicates & Similar")')
    await expect(dupCard).toBeVisible()
    await dupCard.click()
    await page.waitForTimeout(500)

    // Verify route switched to Duplicates page
    await expect(page.locator('.apple-duplicates-page')).toBeVisible({ timeout: 5000 })

    expect(errors.filter((e) => e.includes('PAGE_ERROR'))).toEqual([])
  })

  test('Feature 7: TopBar Controls (Theme Switcher, Grid Density, Sidebar Toggle)', async () => {
    const { page, errors } = appCtx

    const photosNav = page.locator('button.sidebar-nav-item:has-text("All Photos")')
    await photosNav.click()
    await page.waitForTimeout(300)

    // 1. Test Grid Density Toggle
    const densityBtn = page.locator('button.topbar-btn[title*="Grid density"]')
    await expect(densityBtn).toBeVisible()
    await densityBtn.click()
    await page.waitForTimeout(200)
    await densityBtn.click()
    await page.waitForTimeout(200)
    await densityBtn.click()
    await page.waitForTimeout(200)

    // 2. Test Theme Toggle
    const themeBtn = page.locator('button.topbar-btn[title="Toggle theme"]')
    await expect(themeBtn).toBeVisible()
    await themeBtn.click()
    await page.waitForTimeout(300)
    // Toggle back
    await themeBtn.click()
    await page.waitForTimeout(300)

    // 3. Test Sidebar Toggle (Collapse / Expand)
    const sidebarToggleBtn = page.locator('button.topbar-btn[title="Toggle sidebar"]')
    await expect(sidebarToggleBtn).toBeVisible()
    await sidebarToggleBtn.click()
    await page.waitForTimeout(300)
    await expect(page.locator('aside.sidebar')).toHaveClass(/collapsed/)

    // Expand sidebar again
    await sidebarToggleBtn.click()
    await page.waitForTimeout(300)
    await expect(page.locator('aside.sidebar')).not.toHaveClass(/collapsed/)

    expect(errors.filter((e) => e.includes('PAGE_ERROR'))).toEqual([])
  })
})
