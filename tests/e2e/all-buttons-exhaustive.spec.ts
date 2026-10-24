import { test, expect } from '@playwright/test'
import path from 'path'
import { launchTestApp, TestAppContext } from '../helpers/electron-app'

test.describe.serial('PhotoSort Exhaustive All-Buttons Feature Automation Suite', () => {
  test.setTimeout(180000)

  let appCtx: TestAppContext
  const sampleLibraryPath = path.join(process.cwd(), 'test-fixtures', 'sample-library')

  test.beforeAll(async () => {
    appCtx = await launchTestApp()
    const { page } = appCtx

    // Ensure sample photos are imported
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

  test('Group 1: ContextMenu Right-Click Action Buttons', async () => {
    const { page, errors } = appCtx

    // Navigate to All Photos
    await page.locator('button.sidebar-nav-item:has-text("All Photos")').click()
    await page.waitForTimeout(500)

    const photoTile = page.locator('.photo-tile').first()
    await expect(photoTile).toBeVisible()

    // 1. Right-click photo to open ContextMenu
    await photoTile.click({ button: 'right' })
    await page.waitForTimeout(300)

    const contextMenu = page.locator('.context-menu')
    await expect(contextMenu).toBeVisible()

    // Verify ContextMenu action buttons
    const favItem = page.locator('.context-menu-item:has-text("Favorite")')
    const detailsItem = page.locator('.context-menu-item:has-text("Details")')
    const openInExplorerItem = page.locator('.context-menu-item:has-text("Open in explorer")')
    const trashItem = page.locator('.context-menu-item:has-text("Move to trash")')

    await expect(favItem).toBeVisible()
    await expect(detailsItem).toBeVisible()
    await expect(openInExplorerItem).toBeVisible()
    await expect(trashItem).toBeVisible()

    // Click "Favorite" in context menu
    await favItem.click()
    await page.waitForTimeout(400)
    await expect(contextMenu).not.toBeVisible()

    // Right-click again and test "Details" (opens PhotoViewer with info drawer)
    await photoTile.click({ button: 'right' })
    await page.waitForTimeout(300)
    await detailsItem.click()
    await page.waitForTimeout(500)

    // PhotoViewer modal is now open with info panel
    const photoViewer = page.locator('.photo-viewer')
    await expect(photoViewer).toBeVisible()

    // Close PhotoViewer
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await expect(photoViewer).not.toBeVisible()

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Group 2: PhotoViewer Full Toolbar Controls & Slideshow Launch', async () => {
    const { page, errors } = appCtx

    // Open PhotoViewer by clicking photo tile
    const photoTile = page.locator('.photo-tile').first()
    await photoTile.click()
    await page.waitForTimeout(500)

    const photoViewer = page.locator('.photo-viewer')
    await expect(photoViewer).toBeVisible()

    // 1. Test Zoom Toggle by clicking the photo
    const imageEl = page.locator('.photo-viewer-image')
    await expect(imageEl).toBeVisible()
    await imageEl.click()
    await page.waitForTimeout(150)
    await imageEl.click()
    await page.waitForTimeout(150)

    // 2. Test Info / EXIF Details Button (ℹ)
    const infoToggleBtn = page.locator('button.viewer-btn[title="Info"]')
    await expect(infoToggleBtn).toBeVisible()
    await infoToggleBtn.click()
    await page.waitForTimeout(300)
    // Verify Info panel is visible
    const infoPanel = page.locator('.photo-info-panel')
    await expect(infoPanel).toBeVisible()
    // Toggle back off
    await infoToggleBtn.click()
    await page.waitForTimeout(200)

    // 3. Test Favorite Heart Button in viewer
    const favBtn = page.locator('button.viewer-btn[title="Favorite"]')
    await expect(favBtn).toBeVisible()
    await favBtn.click()
    await page.waitForTimeout(200)

    // 4. Test Navigation Buttons: Next & Previous
    const nextBtn = page.locator('button.photo-viewer-nav.next')
    const prevBtn = page.locator('button.photo-viewer-nav.prev')
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click()
      await page.waitForTimeout(200)
    }
    if (await prevBtn.isVisible().catch(() => false)) {
      await prevBtn.click()
      await page.waitForTimeout(200)
    }

    // 5. Test Back button to close PhotoViewer
    const backBtn = page.locator('button.viewer-btn[title="Back"]')
    await expect(backBtn).toBeVisible()
    await backBtn.click()
    await page.waitForTimeout(300)
    await expect(photoViewer).not.toBeVisible()

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Group 3: PhotoEditor Deep Toolset & Filter Preset Buttons', async () => {
    const { page, errors } = appCtx

    // Open first photo
    const photoTile = page.locator('.photo-tile').first()
    await photoTile.click()
    await page.waitForTimeout(400)

    // Click Edit button in PhotoViewer
    const editBtn = page.locator('button.viewer-btn[title="Edit"]')
    await expect(editBtn).toBeVisible()
    await editBtn.click()
    await page.waitForTimeout(500)

    // PhotoEditor is now active
    const editorContainer = page.locator('.photo-editor')
    await expect(editorContainer).toBeVisible()

    // 1. Test Filter Buttons: Normal, Vivid, B&W, Warm, Cool
    const filterButtons = ['Normal', 'Vivid', 'B&W', 'Warm', 'Cool']
    for (const filter of filterButtons) {
      const btn = page.locator(`.photo-editor button:has-text("${filter}")`)
      if (await btn.isVisible().catch(() => false)) {
        await btn.click()
        await page.waitForTimeout(150)
      }
    }

    // 2. Test Rotate Button
    const rotateEditorBtn = page.locator('.photo-editor button:has-text("Rotate")').first()
    if (await rotateEditorBtn.isVisible().catch(() => false)) {
      await rotateEditorBtn.click()
      await page.waitForTimeout(200)
    }

    // 3. Test Reset Button
    const resetBtn = page.locator('.photo-editor button:has-text("Reset")')
    if (await resetBtn.isVisible().catch(() => false)) {
      await resetBtn.click()
      await page.waitForTimeout(200)
    }

    // 4. Test Adjust and Filters Tabs
    const adjustTab = page.locator('.photo-editor button.photo-editor-tab:has-text("Adjust")')
    if (await adjustTab.isVisible().catch(() => false)) {
      await adjustTab.click()
      await page.waitForTimeout(150)
    }
    const filtersTab = page.locator('.photo-editor button.photo-editor-tab:has-text("Filters")')
    if (await filtersTab.isVisible().catch(() => false)) {
      await filtersTab.click()
      await page.waitForTimeout(150)
    }

    // 5. Test Back/Close button in PhotoEditor toolbar
    const backBtn = page.locator('.photo-editor .photo-editor-toolbar button.viewer-btn')
    await expect(backBtn).toBeVisible()
    await backBtn.click()
    await page.waitForTimeout(400)

    await expect(editorContainer).not.toBeVisible()

    // Close PhotoViewer
    const closeViewerBtn = page.locator('button.viewer-btn[title*="Close"]')
    if (await closeViewerBtn.isVisible().catch(() => false)) {
      await closeViewerBtn.click()
    } else {
      await page.keyboard.press('Escape')
    }
    await page.waitForTimeout(300)

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Group 4: CollageModal Multi-Layout Switchers (2x2, Side Split, Hero, 3x3)', async () => {
    const { page, errors } = appCtx

    // Select 2 photos via checkboxes
    const checkboxes = page.locator('button.photo-tile-checkbox')
    await checkboxes.nth(0).click()
    await page.waitForTimeout(200)
    await checkboxes.nth(1).click()
    await page.waitForTimeout(300)

    // Selection bar should be active
    const selectionBar = page.locator('.selection-floating-dock')
    await expect(selectionBar).toBeVisible()

    // Click "Collage" button in selection bar
    const collageBtn = page.locator('button.dock-action-collage')
    await expect(collageBtn).toBeVisible()
    await collageBtn.click()
    await page.waitForTimeout(500)

    // CollageModal is now open
    const collageModal = page.locator('.modal:has-text("Create Collage")')
    await expect(collageModal).toBeVisible()

    // Test layout switcher buttons: 2×2 Grid, Side Split, Hero Feature, 3×3 Grid
    const layouts = ['2×2 Grid', 'Side Split', 'Hero Feature', '3×3 Grid']
    for (const layoutName of layouts) {
      const layoutBtn = collageModal.locator(`button:has-text("${layoutName}")`)
      if (await layoutBtn.isVisible().catch(() => false)) {
        await layoutBtn.click()
        await page.waitForTimeout(150)
      }
    }

    // Test Cancel button
    const cancelBtn = collageModal.locator('button:has-text("Cancel")')
    await expect(cancelBtn).toBeVisible()
    await cancelBtn.click()
    await page.waitForTimeout(300)

    await expect(collageModal).not.toBeVisible()

    // Clear selection
    const clearSelectionBtn = page.locator('button.dock-btn-circle[title*="Clear"]')
    if (await clearSelectionBtn.isVisible().catch(() => false)) {
      await clearSelectionBtn.click()
    } else {
      await page.keyboard.press('Escape')
    }
    await page.waitForTimeout(200)

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Group 5: CleanUpModal & "Free Up Space" Action', async () => {
    const { page, errors } = appCtx

    // On PhotosPage, locate "Free Up Space" header button
    const freeUpSpaceBtn = page.locator('button.btn-free-up-space')
    if (await freeUpSpaceBtn.isVisible().catch(() => false)) {
      await freeUpSpaceBtn.click()
      await page.waitForTimeout(500)

      // CleanUpModal is open - find close or skip button
      const skipBtn = page.locator('button:has-text("Skip to Photos")')
      const closeBtn = page.locator('button[aria-label="Close modal"]')

      if (await skipBtn.isVisible().catch(() => false)) {
        await skipBtn.click()
      } else if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click()
      } else {
        await page.keyboard.press('Escape')
      }
      await page.waitForTimeout(300)
    }

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Group 6: Duplicates Page Sub-Tabs & Selection Action Buttons', async () => {
    const { page, errors } = appCtx

    // Navigate to Duplicates
    await page.locator('button.sidebar-nav-item:has-text("Duplicates")').click()
    await page.waitForTimeout(400)

    // Trigger duplicate scan if needed
    const scanBtn = page.locator('button:has-text("Scan Duplicates")').first()
    if (await scanBtn.isVisible().catch(() => false)) {
      await scanBtn.click()
      await page.waitForTimeout(1000)
    }

    // Test Segment Tab Buttons: All, 100% Exact, 90%+ Similar, Videos
    const tabs = ['All', '100% Exact', '90%+ Similar', 'Videos']
    for (const tabText of tabs) {
      const tabBtn = page.locator(`button.apple-segment-btn:has-text("${tabText}")`)
      if (await tabBtn.isVisible().catch(() => false)) {
        await tabBtn.click()
        await page.waitForTimeout(150)
      }
    }

    // Switch back to All tab
    const allTab = page.locator('button.apple-segment-btn:has-text("All")').first()
    if (await allTab.isVisible().catch(() => false)) {
      await allTab.click()
      await page.waitForTimeout(150)
    }

    // Test Select All / Deselect All duplicate button
    const selectAllBtn = page.locator('button.apple-secondary-btn:has-text("Select All"), button.apple-secondary-btn:has-text("Deselect All")')
    if (await selectAllBtn.isVisible().catch(() => false)) {
      await selectAllBtn.click()
      await page.waitForTimeout(200)
      await selectAllBtn.click()
      await page.waitForTimeout(200)
    }

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Group 7: Large Files Threshold Pills & Media Filters', async () => {
    const { page, errors } = appCtx

    // Navigate to Large Files
    await page.locator('button.sidebar-nav-item:has-text("Large Files")').click()
    await page.waitForTimeout(400)

    // Trigger scan if empty state shows
    const scanBtn = page.locator('button:has-text("Scan Large Files")')
    if (await scanBtn.isVisible().catch(() => false)) {
      await scanBtn.click()
      await page.waitForTimeout(800)
    }

    // 1. Test Threshold Pills: > 50MB, > 100MB, > 500MB, > 1GB
    const thresholds = ['> 50MB', '> 100MB', '> 500MB', '> 1GB']
    for (const thresh of thresholds) {
      const pill = page.locator(`button:has-text("${thresh}")`)
      if (await pill.isVisible().catch(() => false)) {
        await pill.click()
        await page.waitForTimeout(150)
      }
    }

    // 2. Test Media Type Filter Pills: All, Videos, Photos
    const mediaPills = ['All', 'Videos', 'Photos']
    for (const m of mediaPills) {
      const pill = page.locator(`button.apple-segment-btn:has-text("${m}")`)
      if (await pill.isVisible().catch(() => false)) {
        await pill.click()
        await page.waitForTimeout(150)
      }
    }

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Group 8: Social Media & Junk Category Tabs', async () => {
    const { page, errors } = appCtx

    // Navigate to Social Media
    await page.locator('button.sidebar-nav-item:has-text("Social Media")').click()
    await page.waitForTimeout(400)

    // Check for Scan / Rescan button
    const scanBtn = page.locator('button:has-text("Scan Social Media"), button:has-text("Rescan")').first()
    if (await scanBtn.isVisible().catch(() => false)) {
      await scanBtn.click()
      await page.waitForTimeout(800)
    }

    // Test Category Pills
    const junkCategories = ['All Apps', 'WhatsApp', 'Instagram', 'Web Downloads']
    for (const cat of junkCategories) {
      const btn = page.locator(`button:has-text("${cat}")`).first()
      if (await btn.isVisible().catch(() => false)) {
        await btn.click()
        await page.waitForTimeout(150)
      }
    }

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Group 9: Documents Page Category Filter Buttons', async () => {
    const { page, errors } = appCtx

    // Navigate to Documents
    await page.locator('button.sidebar-nav-item:has-text("Documents")').click()
    await page.waitForTimeout(400)

    // Check for Clean False Positives or Scan button
    const scanBtn = page.locator('button:has-text("Scan Documents"), button:has-text("Rescan Documents")').first()
    if (await scanBtn.isVisible().catch(() => false)) {
      await scanBtn.click()
      await page.waitForTimeout(800)
    }

    // Test Document Category filter pills
    const docCategories = ['All Documents', 'ID Cards', 'Receipts', 'Tax / Invoices', 'Certificates', 'Medical']
    for (const cat of docCategories) {
      const pill = page.locator(`button:has-text("${cat}")`).first()
      if (await pill.isVisible().catch(() => false)) {
        await pill.click()
        await page.waitForTimeout(150)
      }
    }

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Group 10: Folders Page Card Action Buttons', async () => {
    const { page, errors } = appCtx

    // Navigate to Imported Folders
    await page.locator('button.sidebar-nav-item:has-text("Imported Folders")').click()
    await page.waitForTimeout(400)

    // Check if folder cards are displayed
    const folderCards = page.locator('.apple-clean-folder-card')
    if (await folderCards.first().isVisible().catch(() => false)) {
      // 1. Test "Sync this folder" button on card
      const syncBtn = folderCards.first().locator('button[title*="Sync this folder"]')
      if (await syncBtn.isVisible().catch(() => false)) {
        await syncBtn.click()
        await page.waitForTimeout(300)
      }

      // 2. Click folder card to view details
      await folderCards.first().click()
      await page.waitForTimeout(300)

      // Test "Back to all folders" circle button
      const backBtn = page.locator('button.apple-icon-circle-btn[title*="Back"], button[title*="Back"]')
      if (await backBtn.isVisible().catch(() => false)) {
        await backBtn.click()
        await page.waitForTimeout(300)
      }
    }

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Group 11: Trash Page Empty & Restore Actions', async () => {
    const { page, errors } = appCtx

    // Navigate to Trash
    await page.locator('button.sidebar-nav-item:has-text("Trash")').click()
    await page.waitForTimeout(400)

    // Verify empty state or active trash action buttons
    const restoreAllBtn = page.locator('button:has-text("Restore All")')
    const emptyTrashBtn = page.locator('button:has-text("Empty Trash")')

    if (await restoreAllBtn.isVisible().catch(() => false)) {
      await expect(restoreAllBtn).toBeEnabled()
    }
    if (await emptyTrashBtn.isVisible().catch(() => false)) {
      await expect(emptyTrashBtn).toBeEnabled()
    }

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Group 12: Locked Folder Security Keypad & Passcode Buttons', async () => {
    const { page, errors } = appCtx

    // Navigate to Locked Folder if present in sidebar or direct view dispatch
    await page.evaluate(() => {
      if ((window as any).__setAppView) {
        (window as any).__setAppView('locked-folder')
      }
    })
    await page.waitForTimeout(400)

    // Check for passcode keypad buttons (0 to 9, Clear, Unlock)
    const keypadButtons = page.locator('button.keypad-btn')
    if (await keypadButtons.first().isVisible().catch(() => false)) {
      // Press digits 1, 2, 3, 4
      await keypadButtons.nth(0).click() // '1'
      await page.waitForTimeout(100)
      await keypadButtons.nth(1).click() // '2'
      await page.waitForTimeout(100)
      await keypadButtons.nth(2).click() // '3'
      await page.waitForTimeout(100)
      await keypadButtons.nth(3).click() // '4'
      await page.waitForTimeout(300)
    }

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })
})
