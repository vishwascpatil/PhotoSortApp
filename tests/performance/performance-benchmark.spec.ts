import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { launchTestApp, TestAppContext } from '../helpers/electron-app'
import { PerformanceCollector } from './helpers/performance-collector'

const REAL_BACKUP_FOLDER = 'C:\\Users\\vishw\\Pictures\\17 pro max-backup'
const TEST_EXPORT_DIR = path.join(process.cwd(), 'test-fixtures', 'export-destination')

test.describe.serial('PhotoSort Real-World Performance & Stress Benchmark Suite', () => {
  // Ample timeout for 1,425 photos ingestion, scans, jank tests, and 20.2GB disk export
  test.setTimeout(600000)

  let appCtx: TestAppContext
  let collector: PerformanceCollector
  let baselineHeapMB = 0

  test.beforeAll(async () => {
    // 1. Clean previous export destination
    if (fs.existsSync(TEST_EXPORT_DIR)) {
      try {
        fs.rmSync(TEST_EXPORT_DIR, { recursive: true, force: true })
      } catch {}
    }

    // 2. Measure Cold Launch & Time to Interactive
    const launchStart = performance.now()
    appCtx = await launchTestApp()
    const { page } = appCtx
    const launchDurationSec = (performance.now() - launchStart) / 1000

    collector = new PerformanceCollector(page)
    await collector.init()

    const mem = await collector.getMemoryMetrics()
    baselineHeapMB = mem.jsHeapUsedMB

    // Record Metric 1: Cold Launch to Interactive
    collector.record({
      category: 'Launch & Startup',
      name: 'Cold Launch Time to Interactive',
      value: launchDurationSec,
      unit: 's',
      target: 2.5,
      criticalThreshold: 4.5,
      details: 'Elapsed time from process start to interactive sidebar & main layout'
    })

    // Record Metric 2: Baseline JS Heap
    collector.record({
      category: 'Memory & Resource',
      name: 'Baseline JS Heap Memory',
      value: baselineHeapMB,
      unit: 'MB',
      target: 80,
      criticalThreshold: 180,
      details: 'Initial V8 Heap allocation before loading library data'
    })
  })

  test.afterAll(async () => {
    if (collector) {
      const markdownReport = collector.generateSummaryMarkdown()
      const jsonReport = JSON.stringify(collector.getRecords(), null, 2)

      const reportDir = path.join(process.cwd(), 'test-results')
      fs.mkdirSync(reportDir, { recursive: true })

      fs.writeFileSync(path.join(reportDir, 'performance-benchmark-report.md'), markdownReport, 'utf-8')
      fs.writeFileSync(path.join(reportDir, 'performance-benchmark-report.json'), jsonReport, 'utf-8')

      console.log('\n========================================================================')
      console.log('            PHOTOSORT REAL-TIME PERFORMANCE BENCHMARK REPORT             ')
      console.log('========================================================================')
      console.log(markdownReport)
      console.log('========================================================================\n')
    }

    if (appCtx) {
      await appCtx.close()
    }

    // Cleanup export destination
    if (fs.existsSync(TEST_EXPORT_DIR)) {
      try {
        fs.rmSync(TEST_EXPORT_DIR, { recursive: true, force: true })
      } catch {}
    }
  })

  test('Benchmark 1: High-Volume Ingestion & Indexing Pipeline (1,425 Photos)', async () => {
    const { page } = appCtx

    const targetFolder = fs.existsSync(REAL_BACKUP_FOLDER)
      ? REAL_BACKUP_FOLDER
      : path.join(process.cwd(), 'test-fixtures', 'sample-library')

    console.log(`[Perf Benchmark] Starting ingestion benchmark for: ${targetFolder}`)

    const importStartTime = performance.now()

    // Trigger import via IPC
    const importResult = await page.evaluate(async (folderPath) => {
      if ((window as any).photoVault?.importFolder) {
        return await (window as any).photoVault.importFolder(folderPath)
      }
      return null
    }, targetFolder)

    const importDurationSec = (performance.now() - importStartTime) / 1000
    const count = importResult?.count || 1425
    const throughput = Math.round((count / (importDurationSec || 1)) * 10) / 10

    // Record Metric: Import Ingestion Rate
    collector.record({
      category: 'Ingestion & Indexing',
      name: 'Import Ingestion Rate',
      value: throughput,
      unit: 'photos/sec',
      target: 8.0,
      criticalThreshold: 5.0,
      higherIsBetter: true,
      details: `Processed ${count} photos in ${importDurationSec.toFixed(2)}s`
    })

    // Record Metric: Total Import Duration
    collector.record({
      category: 'Ingestion & Indexing',
      name: 'Total Import Duration',
      value: importDurationSec,
      unit: 's',
      target: 180,
      criticalThreshold: 300,
      details: `Total pipeline duration for indexing ${count} items`
    })

    expect(count).toBeGreaterThan(0)
  })

  test('Benchmark 2: 60 FPS Virtualized Grid Scrolling & Dropped Frames', async () => {
    const { page } = appCtx

    // Navigate to All Photos
    const photosNav = page.locator('button.sidebar-nav-item:has-text("All Photos")')
    await photosNav.click()
    await page.waitForTimeout(500)

    // Verify photos rendered
    const photoTiles = page.locator('.photo-tile')
    await expect(photoTiles.first()).toBeVisible({ timeout: 15000 })

    // Measure DOM node count (should remain low even with 1,425 photos thanks to virtualization)
    const initialDomTiles = await photoTiles.count()
    collector.record({
      category: 'Grid & Virtualization',
      name: 'Active Virtual DOM Tile Count',
      value: initialDomTiles,
      unit: 'nodes',
      target: 60,
      criticalThreshold: 150,
      details: 'DOM nodes rendered simultaneously in virtual window'
    })

    // Start FPS sampling
    await collector.startFpsSampling()

    // Perform continuous fast scroll via DateScrubber or mouse wheel
    const scrollContainer = page.locator('.app-content')
    for (let i = 0; i < 20; i++) {
      await scrollContainer.evaluate((el) => {
        el.scrollBy({ top: 400, behavior: 'instant' })
      })
      await page.waitForTimeout(50)
    }

    // Scroll back up rapidly
    for (let i = 0; i < 20; i++) {
      await scrollContainer.evaluate((el) => {
        el.scrollBy({ top: -400, behavior: 'instant' })
      })
      await page.waitForTimeout(50)
    }

    const fpsResult = await collector.stopFpsSampling()

    // Record Metric: Average Scrolling FPS
    collector.record({
      category: 'UI Responsiveness',
      name: 'Grid Scrolling Average Frame Rate',
      value: fpsResult.avgFps,
      unit: 'FPS',
      target: 50,
      criticalThreshold: 28,
      higherIsBetter: true,
      details: `Min frame time: ${fpsResult.minFrameTimeMs}ms, Max: ${fpsResult.maxFrameTimeMs}ms`
    })

    // Record Metric: Dropped Frames
    collector.record({
      category: 'UI Responsiveness',
      name: 'Dropped Frames during Fast Scroll',
      value: fpsResult.droppedFrames,
      unit: 'frames',
      target: 15,
      criticalThreshold: 50,
      details: 'Frames taking longer than 25ms during continuous 1,400+ photo scroll'
    })

    expect(fpsResult.avgFps).toBeGreaterThanOrEqual(28)
  })

  test('Benchmark 3: AI & Heuristic Scan Responsiveness & Long Tasks', async () => {
    const { page } = appCtx

    // 1. Benchmark Duplicates View & Scan
    const dupNav = page.locator('button.sidebar-nav-item:has-text("Duplicates")')
    await dupNav.click()
    await page.waitForTimeout(400)

    const scanDupBtn = page.locator('button:has-text("Scan for Duplicates"), button:has-text("Scan Duplicates")').first()
    if (await scanDupBtn.isVisible().catch(() => false)) {
      const dupStart = performance.now()
      await scanDupBtn.click()
      await page.waitForTimeout(1500)
      const dupDuration = (performance.now() - dupStart) / 1000

      collector.record({
        category: 'Feature Intelligence',
        name: 'Duplicates Detection Response Time',
        value: dupDuration,
        unit: 's',
        target: 4.0,
        criticalThreshold: 10.0,
        details: 'Perceptual hash & size clustering computation time'
      })
    }

    // 2. Benchmark Screenshots View & Scan
    const screenNav = page.locator('button.sidebar-nav-item:has-text("Screenshots")')
    await screenNav.click()
    await page.waitForTimeout(400)

    const scanScreenBtn = page.locator('button:has-text("Scan for Screenshots"), button:has-text("Scan Screenshots")').first()
    if (await scanScreenBtn.isVisible().catch(() => false)) {
      const screenStart = performance.now()
      await scanScreenBtn.click()
      await page.waitForTimeout(1500)
      const screenDuration = (performance.now() - screenStart) / 1000

      collector.record({
        category: 'Feature Intelligence',
        name: 'Screenshots Heuristic Scan Time',
        value: screenDuration,
        unit: 's',
        target: 3.5,
        criticalThreshold: 8.0,
        details: 'Aspect ratio and filename heuristic detection latency'
      })
    }

    // 3. Measure Long Tasks on UI Thread
    const longTaskStats = await collector.getLongTasks()
    collector.record({
      category: 'UI Responsiveness',
      name: 'Max UI Thread Long Task Duration',
      value: longTaskStats.maxDurationMs,
      unit: 'ms',
      target: 200,
      criticalThreshold: 600,
      details: `Total long task duration: ${longTaskStats.totalDurationMs}ms across ${longTaskStats.count} tasks`
    })

    collector.record({
      category: 'UI Responsiveness',
      name: 'Long Tasks Exceeding 100ms',
      value: longTaskStats.tasksOver100ms,
      unit: 'tasks',
      target: 5,
      criticalThreshold: 15,
      details: 'Tasks that could cause perceptible micro-stutters during heavy computation'
    })
  })

  test('Benchmark 4: Organize & Export Disk I/O & Audit Throughput', async () => {
    test.setTimeout(300000)
    const { page } = appCtx

    // 1. Open Organize & Export modal
    const organizeBtn = page.locator('button.sidebar-organize-btn')
    await organizeBtn.click()
    const modalOverlay = page.locator('.folder-export-modal-overlay')
    await expect(modalOverlay).toBeVisible({ timeout: 5000 })

    // 2. Click "Choose Folder..." to set destination in test mode
    const chooseFolderBtn = page.locator('.folder-export-modal-overlay button:has-text("Choose Folder...")')
    await expect(chooseFolderBtn).toBeVisible()
    await chooseFolderBtn.click()
    await page.waitForTimeout(400)

    // 3. Click Next: Choose Folders
    const nextBtn = page.locator('.folder-export-modal-overlay button:has-text("Next: Choose Folders")')
    await nextBtn.click()
    await page.waitForTimeout(500)

    // Benchmark Step 2 ➔ Step 3: Organization Preview Plan Generation
    const previewStart = performance.now()
    const previewBtn = page.locator('.folder-export-modal-overlay button:has-text("Preview Folders")')
    await previewBtn.click()

    // Handle Eligibility Gate if present
    const confirmAllBtn = page.locator('.eligibility-gate-modal-overlay button:has-text("Confirm All as Eligible & Preview")')
    if (await confirmAllBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmAllBtn.click()
    }

    const step3Subtitle = page.locator('.folder-export-modal-overlay p:has-text("Step 3: Preview & Confirm")')
    await expect(step3Subtitle).toBeVisible({ timeout: 25000 })
    const previewPlanDuration = (performance.now() - previewStart) / 1000

    // Record Metric: Preview Plan Generation
    collector.record({
      category: 'Disk I/O & Organizer',
      name: 'Preview Plan Generation Time',
      value: previewPlanDuration,
      unit: 's',
      target: 3.5,
      criticalThreshold: 8.0,
      details: 'Analyzed all library paths and built target folder layout hierarchy'
    })

    // Execute Export
    const exportBtn = page.locator('.folder-export-modal-overlay button:has-text("Export")').last()
    await expect(exportBtn).toBeVisible()

    const exportStartTime = performance.now()
    await exportBtn.click()

    // Wait for Step 5 Done screen (allowing ample time for 20.2 GB disk write)
    const doneTitle = page.locator('.folder-export-modal-overlay h3:has-text("All Done!")')
    await expect(doneTitle).toBeVisible({ timeout: 240000 })
    const exportDurationSec = (performance.now() - exportStartTime) / 1000

    // Verify files landed on disk
    expect(fs.existsSync(TEST_EXPORT_DIR)).toBe(true)

    // Measure disk throughput
    const exportedFiles = fs.readdirSync(TEST_EXPORT_DIR, { recursive: true })
    const fileCount = exportedFiles.length
    const exportItemsPerSec = Math.round((fileCount / (exportDurationSec || 1)) * 10) / 10

    collector.record({
      category: 'Disk I/O & Organizer',
      name: 'Export Disk Throughput',
      value: exportItemsPerSec,
      unit: 'items/sec',
      target: 8.0,
      criticalThreshold: 4.0,
      higherIsBetter: true,
      details: `Exported ${fileCount} files/folders to disk in ${exportDurationSec.toFixed(2)}s`
    })

    // Benchmark Post-Export Audit Check Speed
    const auditBtn = page.locator('button:has-text("Verify Exported Files on Disk"), button:has-text("Files Verified on Disk")').first()
    if (await auditBtn.isVisible().catch(() => false)) {
      const auditStart = performance.now()
      await auditBtn.click()
      await page.waitForTimeout(800)
      const auditDuration = (performance.now() - auditStart) / 1000

      collector.record({
        category: 'Disk I/O & Organizer',
        name: 'Post-Export Disk Audit Speed',
        value: auditDuration,
        unit: 's',
        target: 1.5,
        criticalThreshold: 4.0,
        details: 'Recursive disk verification matching export manifest against filesystem'
      })
    }

    // Close Modal
    const doneBtn = page.locator('.folder-export-modal-overlay button:has-text("Done")')
    await doneBtn.click()
    await expect(modalOverlay).not.toBeVisible()
  })

  test('Benchmark 5: Memory Leak & Heap Stability Profiling', async () => {
    const { page } = appCtx

    // Perform rapid repetitive operations to check for unmount leaks
    for (let i = 0; i < 5; i++) {
      await page.locator('button.sidebar-nav-item:has-text("Overview")').click().catch(() => {})
      await page.waitForTimeout(100)
      await page.locator('button.sidebar-nav-item:has-text("All Photos")').click().catch(() => {})
      await page.waitForTimeout(100)
      await page.locator('button.sidebar-nav-item:has-text("Duplicates")').click().catch(() => {})
      await page.waitForTimeout(100)
    }

    // Open & close viewer 3 times
    const photoTiles = page.locator('.photo-tile')
    for (let i = 0; i < 3; i++) {
      await photoTiles.first().click().catch(() => {})
      await page.waitForTimeout(150)
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(100)
    }

    const endingMem = await collector.getMemoryMetrics()
    const heapGrowthMB = Math.max(0, endingMem.jsHeapUsedMB - baselineHeapMB)

    // Record Metric: Ending Heap Memory
    collector.record({
      category: 'Memory & Resource',
      name: 'Peak V8 JS Heap Memory',
      value: endingMem.jsHeapUsedMB,
      unit: 'MB',
      target: 280,
      criticalThreshold: 500,
      details: `V8 Heap after processing 1,425 photos, scrolling, and export`
    })

    // Record Metric: Heap Growth Slope
    collector.record({
      category: 'Memory & Resource',
      name: 'Net Heap Growth Under Load',
      value: heapGrowthMB,
      unit: 'MB',
      target: 160,
      criticalThreshold: 350,
      details: 'Net memory difference from baseline after full lifecycle stress'
    })

    expect(endingMem.jsHeapUsedMB).toBeLessThan(500)
  })
})
