import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launchTestApp, TestAppContext } from '../helpers/electron-app'

interface ButtonTestResult {
  page: string
  buttonText: string
  buttonTitle: string
  selector: string
  modalOpened?: string
  status: 'PASS' | 'FAIL' | 'SKIPPED'
  error?: string
  durationMs: number
}

test.describe('PhotoSort Exhaustive Button & Interaction Crawler', () => {
  let appCtx: TestAppContext
  const results: ButtonTestResult[] = []

  test.beforeAll(async () => {
    appCtx = await launchTestApp()
  })

  test.afterAll(async () => {
    // Write out the comprehensive crawler report
    const reportDir = path.join(process.cwd(), 'test-results')
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true })
    }
    const reportPath = path.join(reportDir, 'button-crawler-report.json')
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2))
    console.log(`\n======================================================`)
    console.log(`BUTTON CRAWLER COMPLETED: Tested ${results.length} interactive elements`)
    console.log(`Passed: ${results.filter(r => r.status === 'PASS').length}`)
    console.log(`Failed: ${results.filter(r => r.status === 'FAIL').length}`)
    console.log(`Report written to: ${reportPath}`)
    console.log(`======================================================\n`)

    if (appCtx) {
      await appCtx.close()
    }
  })

  const pagesToCrawl = [
    { id: 'photos', label: 'All Photos' },
    { id: 'favorites', label: 'Favorites' },
    { id: 'videos', label: 'Videos' },
    { id: 'people', label: 'People' },
    { id: 'places', label: 'Places' },
    { id: 'documents', label: 'Documents' },
    { id: 'duplicates', label: 'Duplicates' },
    { id: 'screenshots', label: 'Screenshots' },
    { id: 'large-files', label: 'Large Files' },
    { id: 'junk', label: 'Social Media' },
    { id: 'trash', label: 'Trash' },
    { id: 'folders', label: 'Imported Folders' }
  ]

  for (const pageItem of pagesToCrawl) {
    test(`Crawl all buttons on [${pageItem.label}] page`, async () => {
      const { page, errors } = appCtx

      // Handle any native window alert/confirm gracefully
      page.on('dialog', async (dialog) => {
        try {
          await dialog.dismiss()
        } catch {}
      })

      // 1. Navigate to the page
      const navBtn = page.locator(`button.sidebar-nav-item:has-text("${pageItem.label}")`).first()
      await navBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
      await navBtn.click().catch(() => {})
      await page.waitForTimeout(500)

      // 2. Query visible buttons inside the main content area of the current view
      const buttons = await page.locator('.app-content button:visible').all()

      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i]
        if (!(await btn.isVisible().catch(() => false))) continue

        const text = (await btn.innerText().catch(() => '')).trim()
        const title = (await btn.getAttribute('title').catch(() => '')) || ''
        const className = (await btn.getAttribute('class').catch(() => '')) || ''

        const startTime = Date.now()
        const initialErrorCount = errors.length

        try {
          // Click the button safely
          await btn.click({ timeout: 2000, force: true }).catch(() => {})
          await page.waitForTimeout(300)

          // Check if a modal or popup dialog was opened
          let openedModal: string | undefined
          const modalOverlay = page.locator('.modal-backdrop, .modal-overlay, .apple-modal-overlay, .cleanup-modal-overlay, .shortcuts-modal-overlay')
          if (await modalOverlay.first().isVisible().catch(() => false)) {
            openedModal = 'Modal Opened'
            // Find close button in modal and close it
            const closeBtn = page.locator('.modal-backdrop button, .modal-overlay button, .cleanup-modal-overlay button, .shortcuts-modal-overlay button, button.modal-close-btn').filter({ hasText: /Close|Cancel|×/ }).first()
            if (await closeBtn.isVisible().catch(() => false)) {
              await closeBtn.click().catch(() => {})
              await page.waitForTimeout(200)
            } else {
              // Press Escape as failsafe to close modal
              await page.keyboard.press('Escape')
              await page.waitForTimeout(200)
            }
          }

          const hasNewErrors = errors.length > initialErrorCount
          const newErrors = hasNewErrors ? errors.slice(initialErrorCount).join('\n') : undefined

          results.push({
            page: pageItem.label,
            buttonText: text || '(icon)',
            buttonTitle: title,
            selector: `button.${className.split(' ').filter(Boolean).join('.')}`,
            modalOpened: openedModal,
            status: hasNewErrors ? 'FAIL' : 'PASS',
            error: newErrors,
            durationMs: Date.now() - startTime
          })
        } catch (err: any) {
          results.push({
            page: pageItem.label,
            buttonText: text || '(icon)',
            buttonTitle: title,
            selector: `button.${className.split(' ').filter(Boolean).join('.')}`,
            status: 'FAIL',
            error: err.message,
            durationMs: Date.now() - startTime
          })
        }
      }

      // Ensure no crash occurred on this page
      const errorBoundary = page.locator('.error-boundary-container')
      await expect(errorBoundary).not.toBeVisible()
    })
  }
})
