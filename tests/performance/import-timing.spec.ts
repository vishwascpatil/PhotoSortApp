import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { launchTestApp, TestAppContext } from '../helpers/electron-app'

const REAL_BACKUP_FOLDER = 'C:\\Users\\vishw\\Pictures\\17 pro max-backup'

test.describe('PhotoSort Cold Import Performance & Integrity Benchmark', () => {
  test.setTimeout(180000) // 3 minutes max

  let appCtx: TestAppContext

  test.afterEach(async () => {
    if (appCtx) {
      const uDir = appCtx.userDataDir
      await appCtx.close()
      // Clean up test userData directory to keep repo pristine
      try {
        if (fs.existsSync(uDir)) {
          fs.rmSync(uDir, { recursive: true, force: true })
        }
      } catch {}
    }
  })

  test('Measures live cold import of 17 pro max-backup and validates 100% thumbnails with 0 errors', async () => {
    // 1. Launch real Electron application in clean sandbox
    appCtx = await launchTestApp()
    const { page, userDataDir, errors } = appCtx

    console.log('\n======================================================')
    console.log('    TESTING LIVE COLD IMPORT OF 17 PRO MAX BACKUP     ')
    console.log('======================================================')
    console.log('Target folder:', REAL_BACKUP_FOLDER)

    const startTime = Date.now()

    // 2. Trigger real import via IPC
    const result = await page.evaluate(async (targetDir) => {
      if ((window as any).photoVault?.importFolder) {
        return await (window as any).photoVault.importFolder(targetDir)
      }
      return null
    }, REAL_BACKUP_FOLDER)

    const endTime = Date.now()
    const totalDurationSec = (endTime - startTime) / 1000

    console.log(`\nImport completed in: ${totalDurationSec.toFixed(2)} seconds`)
    console.log(`Reported count: ${result?.count} items`)

    // 3. Inspect generated thumbnails on disk
    const thumbDir = path.join(userDataDir, 'thumbnails')
    const thumbFiles = fs.existsSync(thumbDir) ? fs.readdirSync(thumbDir).filter(f => f.endsWith('.jpg')) : []
    let totalThumbBytes = 0
    let emptyThumbnails = 0

    for (const f of thumbFiles) {
      const s = fs.statSync(path.join(thumbDir, f)).size
      if (s === 0) emptyThumbnails++
      totalThumbBytes += s
    }

    const totalThumbMB = (totalThumbBytes / 1024 / 1024).toFixed(2)
    const avgThumbKB = thumbFiles.length > 0 ? (totalThumbBytes / thumbFiles.length / 1024).toFixed(1) : 0
    const coveragePct = result?.count ? ((thumbFiles.length / result.count) * 100).toFixed(1) : '100'

    console.log('\n--- VERIFICATION STATS ---')
    console.log(`Total Media Items:           ${result?.count}`)
    console.log(`Thumbnails On Disk:          ${thumbFiles.length} / ${result?.count} (${coveragePct}%)`)
    console.log(`Total Thumbnail Storage:     ${totalThumbMB} MB`)
    console.log(`Average Thumbnail Size:      ${avgThumbKB} KB`)
    console.log(`Empty/Corrupted Thumbnails:  ${emptyThumbnails}`)
    console.log(`Runtime Error Count:         ${errors.length}`)
    console.log('======================================================\n')

    // 4. Assertions
    expect(result).not.toBeNull()
    expect(result?.success).toBe(true)
    expect(totalDurationSec).toBeLessThan(150) // Cold import of 21.65GB (including 248 4K videos)
    expect(thumbFiles.length).toBe(1425)
    expect(emptyThumbnails).toBe(0)
    expect(errors.length).toBe(0)
  })
})
