import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { launchTestApp, TestAppContext } from '../helpers/electron-app'

test.describe.serial('PhotoSort Organize & Export Deep Feature Automation Suite', () => {
  // Allow ample time for multi-step execution, preview validation, and disk export
  test.setTimeout(120000)

  let appCtx: TestAppContext
  const sampleLibraryPath = path.join(process.cwd(), 'test-fixtures', 'sample-library')
  const testExportDestination = path.join(process.cwd(), 'test-fixtures', 'export-destination')

  test.beforeAll(async () => {
    // 1. Clean up any existing export destination folder before running
    if (fs.existsSync(testExportDestination)) {
      try {
        fs.rmSync(testExportDestination, { recursive: true, force: true })
      } catch {}
    }

    // 2. Launch test application with isolated test environment
    appCtx = await launchTestApp()
    const { page } = appCtx

    // 3. Ensure sample-library photos are imported so we have real data to organize
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
    // Clean up test export destination
    if (fs.existsSync(testExportDestination)) {
      try {
        fs.rmSync(testExportDestination, { recursive: true, force: true })
      } catch {}
    }
  })

  test('Step 1: Modal Launch & Destination Options (Copy vs Move, Browse Folder, Layout)', async () => {
    const { page, errors } = appCtx

    // 1. Click Organize & Export in Sidebar
    const organizeBtn = page.locator('button.sidebar-organize-btn')
    await expect(organizeBtn).toBeVisible()
    await organizeBtn.click()
    await page.waitForTimeout(500)

    // 2. Verify Modal Overlay and Header
    const modalOverlay = page.locator('.folder-export-modal-overlay')
    await expect(modalOverlay).toBeVisible()

    const modalTitle = page.locator('.folder-export-modal-overlay h2:has-text("Organize & Export")')
    await expect(modalTitle).toBeVisible()

    // Subtitle indicates Step 1
    const subtitle = page.locator('.folder-export-modal-overlay p:has-text("Step 1: Choose Where to Save")')
    await expect(subtitle).toBeVisible()

    // Wizard Stepper verification
    const step1Pill = page.locator('.export-wizard-step:has-text("Destination")')
    await expect(step1Pill).toHaveClass(/active/)

    // 3. Mode Toggling: Click "Organize Current Folder" (Move mode)
    const moveCard = page.locator('.folder-export-modal-overlay strong:has-text("Organize Current Folder")')
    await expect(moveCard).toBeVisible()
    await moveCard.click()
    await page.waitForTimeout(300)

    // In Move mode, destination selector is hidden, Next button is active
    const nextBtn = page.locator('.folder-export-modal-overlay button:has-text("Next: Choose Folders")')
    await expect(nextBtn).toBeEnabled()

    // 4. Switch back to "Copy to a New Folder" (Copy mode)
    const copyCard = page.locator('.folder-export-modal-overlay strong:has-text("Copy to a New Folder")')
    await expect(copyCard).toBeVisible()
    await copyCard.click()
    await page.waitForTimeout(300)

    // Destination input is now visible
    const destInput = page.locator('.folder-export-modal-overlay input[placeholder*="destination folder"]')
    await expect(destInput).toBeVisible()

    // Next button should be disabled when destinationDir is empty
    const isNextDisabled = await nextBtn.isDisabled()
    expect(isNextDisabled).toBe(true)

    // 5. Click "Choose Folder..." button to set destination (mocked in test mode to test-fixtures/export-destination)
    const chooseFolderBtn = page.locator('.folder-export-modal-overlay button:has-text("Choose Folder...")')
    await expect(chooseFolderBtn).toBeVisible()
    await chooseFolderBtn.click()
    await page.waitForTimeout(400)

    // Verify input now contains destination path
    const inputValue = await destInput.inputValue()
    expect(inputValue.length).toBeGreaterThan(0)
    expect(inputValue.toLowerCase()).toContain('export-destination')

    // Next button should now be enabled
    await expect(nextBtn).toBeEnabled()

    // 6. Click Next: Choose Folders to navigate to Step 2
    await nextBtn.click()
    await page.waitForTimeout(500)

    // Verify transition to Step 2
    const step2Subtitle = page.locator('.folder-export-modal-overlay p:has-text("Step 2: Pick Your Magic Folders")')
    await expect(step2Subtitle).toBeVisible()

    const step2Pill = page.locator('.export-wizard-step:has-text("Folders")')
    await expect(step2Pill).toHaveClass(/active/)

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Step 2: Category Grid, Preset Toggles, Video Sub-placement, and Deep Review Hub', async () => {
    const { page, errors } = appCtx

    // 1. Verify 9 Category Tiles are present
    const tiles = page.locator('.export-tile')
    const tileCount = await tiles.count()
    expect(tileCount).toBe(9)

    // 2. Test "Clear" button (Deselects all categories)
    const clearBtn = page.locator('.folder-export-modal-overlay button:has-text("Clear")')
    await expect(clearBtn).toBeVisible()
    await clearBtn.click()
    await page.waitForTimeout(200)

    const selectedTilesAfterClear = page.locator('.export-tile.selected')
    expect(await selectedTilesAfterClear.count()).toBe(0)

    // 3. Test "Select All" button (Selects all 9 categories)
    const selectAllBtn = page.locator('.folder-export-modal-overlay button:has-text("Select All")')
    await expect(selectAllBtn).toBeVisible()
    await selectAllBtn.click()
    await page.waitForTimeout(200)

    const selectedTilesAfterAll = page.locator('.export-tile.selected')
    expect(await selectedTilesAfterAll.count()).toBe(9)

    // 4. Test "🪄 Magic Preset" button
    const magicPresetBtn = page.locator('.export-magic-btn')
    await expect(magicPresetBtn).toBeVisible()
    await magicPresetBtn.click()
    await page.waitForTimeout(200)

    // Magic preset activates 8 core categories while keeping social media clean
    const selectedAfterMagic = await page.locator('.export-tile.selected').count()
    expect(selectedAfterMagic).toBeGreaterThanOrEqual(7)

    // 5. Test Video Placement Choice inside the Videos category tile
    const stayTogetherBtn = page.locator('button:has-text("Stay Together")').first()
    const separateFolderBtn = page.locator('button:has-text("Separate Folder")').first()

    if (await stayTogetherBtn.isVisible()) {
      await stayTogetherBtn.click()
      await page.waitForTimeout(150)
      await separateFolderBtn.click()
      await page.waitForTimeout(150)
    }

    // 6. Test Individual Tile Toggle (e.g. Favorites tile)
    const favoritesTile = page.locator('.export-tile:has-text("Favorites")').first()
    await favoritesTile.click()
    await page.waitForTimeout(150)
    // Click again to re-enable
    await favoritesTile.click()
    await page.waitForTimeout(150)
    await expect(favoritesTile).toHaveClass(/selected/)

    // 7. Test Collapsible Advanced Options Accordion
    const advancedToggleBtn = page.locator('button:has-text("Advanced Options")')
    await expect(advancedToggleBtn).toBeVisible()
    await advancedToggleBtn.click()
    await page.waitForTimeout(250)

    // Folder structure layout options: Year First vs Category First
    const yearFirstOption = page.locator('strong:has-text("Folders by Year First")')
    await expect(yearFirstOption).toBeVisible()
    await yearFirstOption.click()
    await page.waitForTimeout(150)

    const categoryFirstOption = page.locator('strong:has-text("Folders by Category First")')
    await expect(categoryFirstOption).toBeVisible()
    await categoryFirstOption.click()
    await page.waitForTimeout(150)

    // Deep Review Hub buttons exist inside Advanced Options
    const reviewPeopleBtn = page.locator('button:has-text("Review People & Names")')
    await expect(reviewPeopleBtn).toBeVisible()

    const reviewPlacesBtn = page.locator('button:has-text("Review Places & Cities")')
    await expect(reviewPlacesBtn).toBeVisible()

    const reviewDocsBtn = page.locator('button:has-text("Review Documents & Bills")')
    await expect(reviewDocsBtn).toBeVisible()

    const reviewDupesBtn = page.locator('button:has-text("Review Duplicates & Similar")')
    await expect(reviewDupesBtn).toBeVisible()

    // Collapse Advanced Options
    await advancedToggleBtn.click()
    await page.waitForTimeout(200)

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Step 2: Category Review Drawers (People, Documents, Places, Duplicates)', async () => {
    const { page, errors } = appCtx

    // 1. Open Documents Review Drawer
    const docReviewBtn = page.locator('.export-tile:has-text("Documents") button:has-text("Review")').first()
    await expect(docReviewBtn).toBeVisible()
    await docReviewBtn.click()
    await page.waitForTimeout(400)

    // Verify Review Drawer header
    const reviewHeader = page.locator('h3:has-text("Review & Confirm: Documents")')
    await expect(reviewHeader).toBeVisible()

    // Test Select All / Deselect All inside Review Drawer
    const docDeselectAll = page.locator('.category-review-sheet').getByRole('button', { name: /^Deselect All/ })
    if (await docDeselectAll.isVisible()) {
      await docDeselectAll.click()
      await page.waitForTimeout(200)
      const docSelectAll = page.locator('.category-review-sheet').getByRole('button', { name: /^Select All/ })
      if (await docSelectAll.isVisible()) {
        await docSelectAll.click()
        await page.waitForTimeout(200)
      }
    }

    // Close Documents Review Drawer via Back button
    const backBtn = page.locator('.category-review-sheet').getByRole('button', { name: 'Back to Options' })
    await backBtn.click()
    await page.waitForTimeout(300)
    await expect(reviewHeader).not.toBeVisible()

    // 2. Open Places Review Drawer
    const placesReviewBtn = page.locator('.export-tile:has-text("Places") button:has-text("Review")').first()
    await placesReviewBtn.click()
    await page.waitForTimeout(400)

    const placesHeader = page.locator('.category-review-sheet h3:has-text("Review & Confirm: Places")')
    await expect(placesHeader).toBeVisible()

    // Close Places Review Drawer
    const placesBackBtn = page.locator('.category-review-sheet').getByRole('button', { name: 'Back to Options' })
    await placesBackBtn.click()
    await page.waitForTimeout(300)
    await expect(placesHeader).not.toBeVisible()

    // 3. Open Duplicates Review Drawer
    const dupesReviewBtn = page.locator('.export-tile:has-text("Duplicates") button:has-text("Review")').first()
    await dupesReviewBtn.click()
    await page.waitForTimeout(400)

    const dupesHeader = page.locator('.category-review-sheet h3:has-text("Review & Confirm: Duplicates")')
    await expect(dupesHeader).toBeVisible()

    // Close Duplicates Review Drawer
    const dupesBackBtn = page.locator('.category-review-sheet').getByRole('button', { name: 'Back to Options' })
    await dupesBackBtn.click()
    await page.waitForTimeout(300)
    await expect(dupesHeader).not.toBeVisible()

    // 4. Open People Review Drawer
    const peopleReviewBtn = page.locator('.export-tile:has-text("People") button:has-text("Review")').first()
    await peopleReviewBtn.click()
    await page.waitForTimeout(400)

    const peopleHeader = page.locator('.category-review-sheet h3:has-text("Review & Confirm: People")')
    await expect(peopleHeader).toBeVisible()

    // Toggle "Only create folders for named people" checkbox
    const namedOnlyCheckbox = page.locator('.category-review-sheet input[type="checkbox"]').first()
    if (await namedOnlyCheckbox.isVisible()) {
      await namedOnlyCheckbox.click()
      await page.waitForTimeout(150)
      await namedOnlyCheckbox.click()
      await page.waitForTimeout(150)
    }

    // Close People Review Drawer
    const peopleBackBtn = page.locator('.category-review-sheet').getByRole('button', { name: 'Back to Options' })
    await peopleBackBtn.click()
    await page.waitForTimeout(300)
    await expect(peopleHeader).not.toBeVisible()

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Step 2 to Step 3: Eligibility Gate Modal and Safe Confirmation', async () => {
    const { page, errors } = appCtx

    // 1. Click "Preview Folders" in modal footer
    const previewFoldersBtn = page.locator('.folder-export-modal-overlay button:has-text("Preview Folders")')
    await expect(previewFoldersBtn).toBeVisible()
    await previewFoldersBtn.click()
    await page.waitForTimeout(400)

    // 2. The Eligibility Gate Modal must appear since categories are awaiting confirmation
    const gateModal = page.locator('.eligibility-gate-modal-overlay h3:has-text("Review Categories Before Export")')
    await expect(gateModal).toBeVisible()

    // 3. Test dismissing the Gate Modal to review more
    const dismissBtn = page.locator('.eligibility-gate-modal-overlay button:has-text("Review Categories First")')
    await expect(dismissBtn).toBeVisible()
    await dismissBtn.click()
    await page.waitForTimeout(300)

    // Gate modal dismissed, still on Step 2
    await expect(gateModal).not.toBeVisible()
    const step2Subtitle = page.locator('.folder-export-modal-overlay p:has-text("Step 2: Pick Your Magic Folders")')
    await expect(step2Subtitle).toBeVisible()

    // 4. Click "Preview Folders" again
    await previewFoldersBtn.click()
    await page.waitForTimeout(400)
    await expect(gateModal).toBeVisible()

    // 5. Click "Confirm All as Eligible & Preview"
    const confirmAllBtn = page.locator('.eligibility-gate-modal-overlay button:has-text("Confirm All as Eligible & Preview")')
    await expect(confirmAllBtn).toBeVisible()
    await confirmAllBtn.click()

    // 6. Wizard transitions to Step 3 (Preview & Confirm)
    const step3Subtitle = page.locator('.folder-export-modal-overlay p:has-text("Step 3: Preview & Confirm")')
    await expect(step3Subtitle).toBeVisible({ timeout: 15000 })

    const step3Pill = page.locator('.export-wizard-step:has-text("Preview")')
    await expect(step3Pill).toHaveClass(/active/)

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Step 3: Interactive Folder Tree, Side-by-Side Validation, Search Filter, and Re-Validate', async () => {
    const { page, errors } = appCtx

    // 1. Summary Statistics Badges
    const totalFilesLabel = page.locator('.folder-export-modal-overlay span:has-text("TOTAL FILES")')
    await expect(totalFilesLabel).toBeVisible()

    const totalSizeLabel = page.locator('.folder-export-modal-overlay span:has-text("TOTAL SIZE")')
    await expect(totalSizeLabel).toBeVisible()

    // 2. Tab 1: "Preview Folders on Disk"
    const folderTreeTabBtn = page.locator('button:has-text("Preview Folders on Disk")')
    await expect(folderTreeTabBtn).toBeVisible()

    // Folder groups tree on disk
    const folderGroupRows = page.locator('.folder-export-modal-overlay strong')
    expect(await folderGroupRows.count()).toBeGreaterThan(0)

    // Toggle expand/collapse of the first folder header
    const firstFolderHeader = page.locator('.export-folder-tree-header').first()
    if (await firstFolderHeader.isVisible()) {
      await firstFolderHeader.click()
      await page.waitForTimeout(200)
      await firstFolderHeader.click()
      await page.waitForTimeout(200)
    }

    // Verify Quick Verification Banner is present
    const quickBanner = page.locator('.export-validation-banner')
    await expect(quickBanner).toBeVisible()

    // 3. Switch to Tab 2: "Side-by-Side Validation"
    const validationTabBtn = page.locator('button:has-text("Side-by-Side Validation")')
    await expect(validationTabBtn).toBeVisible()
    await validationTabBtn.click()
    await page.waitForTimeout(500)

    // Verify Side-by-Side comparison cards
    const originalSourceCard = page.locator('strong:has-text("Original Source Folder")')
    await expect(originalSourceCard).toBeVisible()

    // Central Match bridge or match status
    const matchBridge = page.locator('span:has-text("Match"), span:has-text("100% Match")').first()
    await expect(matchBridge).toBeVisible()

    // File-by-File Size & Match Audit Table
    const auditTableHeader = page.locator('div:has-text("File-by-File Size & Match Audit")').first()
    await expect(auditTableHeader).toBeVisible()

    // 4. Test Search Filtering in Validation table
    const searchInput = page.locator('input[placeholder="Filter files..."]')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('jpg')
    await page.waitForTimeout(300)

    // Clear search filter
    await searchInput.fill('')
    await page.waitForTimeout(200)

    // 5. Test "Re-Validate Files" button
    const revalidateBtn = page.locator('button:has-text("Re-Validate Files")')
    await expect(revalidateBtn).toBeVisible()
    await revalidateBtn.click()
    await page.waitForTimeout(600)
    await expect(revalidateBtn).toBeEnabled()

    // 6. Switch back to Folder Tree via footer button
    const viewFolderTreeFooterBtn = page.locator('button:has-text("View Folder Tree")')
    if (await viewFolderTreeFooterBtn.isVisible()) {
      await viewFolderTreeFooterBtn.click()
      await page.waitForTimeout(300)
    }

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Step 3 Back Navigation: returns to Step 2 and Step 1 without resetting selections', async () => {
    const { page, errors } = appCtx

    // 1. From Step 3, click "Back: Choose Folders"
    const backToStep2Btn = page.locator('button:has-text("Back: Choose Folders")')
    await expect(backToStep2Btn).toBeVisible()
    await backToStep2Btn.click()
    await page.waitForTimeout(300)

    // Verify user is back on Step 2
    const step2Subtitle = page.locator('.folder-export-modal-overlay p:has-text("Step 2: Pick Your Magic Folders")')
    await expect(step2Subtitle).toBeVisible()

    // 2. From Step 2, click "Back: Where to Save"
    const backToStep1Btn = page.locator('button:has-text("Back: Where to Save")')
    await expect(backToStep1Btn).toBeVisible()
    await backToStep1Btn.click()
    await page.waitForTimeout(300)

    // Verify user is back on Step 1 and destination path was retained
    const step1Subtitle = page.locator('.folder-export-modal-overlay p:has-text("Step 1: Choose Where to Save")')
    await expect(step1Subtitle).toBeVisible()

    const destInput = page.locator('.folder-export-modal-overlay input[placeholder*="destination folder"]')
    const val = await destInput.inputValue()
    expect(val.toLowerCase()).toContain('export-destination')

    // 3. Navigate forward again: Click "Next: Choose Folders"
    const nextBtn = page.locator('button:has-text("Next: Choose Folders")')
    await nextBtn.click()
    await page.waitForTimeout(300)

    // 4. On Step 2, click "Preview Folders" -> Advances straight to Step 3 because categories are confirmed
    const previewFoldersBtn = page.locator('button:has-text("Preview Folders")')
    await previewFoldersBtn.click()
    await page.waitForTimeout(600)

    const step3Subtitle = page.locator('.folder-export-modal-overlay p:has-text("Step 3: Preview & Confirm")')
    await expect(step3Subtitle).toBeVisible()

    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })

  test('Step 4 & Step 5: Full Organization Execution, Progress Tracking, Post-Export Audit, and Completion', async () => {
    const { page, errors } = appCtx

    // 1. On Step 3, click "Export ... Photos" button
    const exportBtn = page.locator('.folder-export-modal-overlay button:has-text("Export")').last()
    await expect(exportBtn).toBeVisible()
    await exportBtn.click()

    // 2. Step 4 Progress Bar appears / transitions to Step 5 All Done
    const allDoneTitle = page.locator('.folder-export-modal-overlay h3:has-text("All Done!")')
    await expect(allDoneTitle).toBeVisible({ timeout: 30000 })

    // Verify Summary Statistics Grid on completion screen
    const totalFilesBox = page.locator('.folder-export-modal-overlay div:has-text("TOTAL FILES")').last()
    await expect(totalFilesBox).toBeVisible()

    const organizedBox = page.locator('.folder-export-modal-overlay div:has-text("ORGANIZED")').last()
    await expect(organizedBox).toBeVisible()

    const skippedBox = page.locator('.folder-export-modal-overlay div:has-text("SKIPPED / ERRORS")').last()
    await expect(skippedBox).toBeVisible()

    // 4. Test "Verify Exported Files on Disk" (Post-Export Audit) button
    const auditBtn = page.locator('button:has-text("Verify Exported Files on Disk"), button:has-text("Files Verified on Disk")').first()
    await expect(auditBtn).toBeVisible()
    await auditBtn.click()
    await page.waitForTimeout(800)

    // Button updates to verified status badge
    const verifiedBadge = page.locator('button:has-text("Files Verified on Disk")')
    await expect(verifiedBadge).toBeVisible({ timeout: 10000 })

    // 5. Test "Open Folder in Explorer" button
    const openFolderBtn = page.locator('button:has-text("Open Folder in Explorer")')
    await expect(openFolderBtn).toBeVisible()
    await openFolderBtn.click()
    await page.waitForTimeout(300)

    // 6. Test "Done" button to close the modal cleanly
    const doneBtn = page.locator('.folder-export-modal-overlay button:has-text("Done")')
    await expect(doneBtn).toBeVisible()
    await doneBtn.click()
    await page.waitForTimeout(500)

    // Verify modal overlay is completely closed
    const modalOverlay = page.locator('.folder-export-modal-overlay')
    await expect(modalOverlay).not.toBeVisible()

    // 7. Verify exported files exist on disk in the export destination directory
    expect(fs.existsSync(testExportDestination)).toBe(true)
    const exportedItems = fs.readdirSync(testExportDestination)
    expect(exportedItems.length).toBeGreaterThan(0)

    // Verify zero fatal page errors across the entire execution
    expect(errors.filter(e => e.startsWith('[PAGE_ERROR]'))).toHaveLength(0)
  })
})
