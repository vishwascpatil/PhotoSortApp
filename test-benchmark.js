const { app } = require('electron')
const { join, extname } = require('path')
const { readdir, stat } = require('fs/promises')
const { performance } = require('perf_hooks')
const sharp = require('sharp')

app.setName('photosort')

app.whenReady().then(async () => {
  const mainModule = require('./out/main/index.js')
  const { generateThumbnailBatch } = mainModule

  const targetDir = 'C:\\Users\\vishw\\Downloads\\17 pro max-backup'
  console.log(`\n======================================================`)
  console.log(`🚀 Starting Thumbnail Generation Benchmark on:`)
  console.log(`   ${targetDir}`)
  console.log(`======================================================\n`)

  const t0 = performance.now()

  // 1. Scan Directory directly
  console.log(`[1/2] Scanning files...`)
  const filePaths = []
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory() && !e.name.startsWith('.')) {
        await walk(full)
      } else if (e.isFile()) {
        filePaths.push(full)
      }
    }
  }
  await walk(targetDir)

  const tScan = performance.now()
  console.log(`   ✓ Found ${filePaths.length} total files in ${((tScan - t0) / 1000).toFixed(2)}s`)

  // 2. Run Batch Thumbnail Generation
  console.log(`[2/2] Generating Thumbnails for ${filePaths.length} items...`)
  const batchInput = filePaths.map((fp, idx) => ({ id: idx + 1, filePath: fp }))

  const tThumbStart = performance.now()
  let lastLogPct = 0

  await generateThumbnailBatch(batchInput, (completed, total) => {
    const pct = Math.floor((completed / total) * 100)
    if (pct >= lastLogPct + 10 || completed === total) {
      lastLogPct = pct
      const elapsed = ((performance.now() - tThumbStart) / 1000).toFixed(1)
      console.log(`   ➜ Progress: ${completed}/${total} (${pct}%) — ${elapsed}s elapsed`)
    }
  })

  const tThumbEnd = performance.now()
  const thumbDurationSec = (tThumbEnd - tThumbStart) / 1000
  const totalDurationSec = (tThumbEnd - t0) / 1000

  console.log(`\n======================================================`)
  console.log(`📊 BENCHMARK RESULTS:`)
  console.log(`   Total Media Items:         ${filePaths.length}`)
  console.log(`   Thumbnail Generation Time: ${thumbDurationSec.toFixed(2)} seconds`)
  console.log(`   Total End-to-End Time:     ${totalDurationSec.toFixed(2)} seconds`)
  console.log(`   Average Speed per Item:    ${(thumbDurationSec / filePaths.length * 1000).toFixed(1)} ms/item`)
  console.log(`======================================================\n`)

  if (totalDurationSec <= 60) {
    console.log(`✅ SUCCESS: Completed in ${totalDurationSec.toFixed(2)}s (< 60s target)!`)
  } else {
    console.error(`❌ FAILED: ${totalDurationSec.toFixed(2)}s exceeded 60s limit!`)
  }
  app.quit()
})
