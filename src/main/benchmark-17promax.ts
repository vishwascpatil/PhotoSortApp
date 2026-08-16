import { scanDirectory, processFiles } from './importer'
import { generateThumbnailBatch } from './thumbnails'
import { performance } from 'perf_hooks'

async function runBenchmark() {
  const targetDir = 'C:\\Users\\vishw\\Downloads\\17 pro max-backup'
  console.log(`\n======================================================`)
  console.log(`🚀 Starting Thumbnail Generation Benchmark on:`)
  console.log(`   ${targetDir}`)
  console.log(`======================================================\n`)

  const t0 = performance.now()

  // 1. Scan Directory
  console.log(`[1/3] Scanning directory files...`)
  const scannedFiles = await scanDirectory(targetDir)
  const tScan = performance.now()
  console.log(`   ✓ Scanned ${scannedFiles.length} media files in ${((tScan - t0) / 1000).toFixed(2)}s`)

  // 2. Process File Metadata
  console.log(`[2/3] Processing file metadata...`)
  const processed = await processFiles(scannedFiles)
  const tMeta = performance.now()
  console.log(`   ✓ Metadata extracted in ${((tMeta - tScan) / 1000).toFixed(2)}s`)

  // 3. Benchmark Thumbnail Generation
  console.log(`[3/3] Generating Thumbnails for ${processed.length} files...`)
  const batchInput = processed.map((p, idx) => ({ id: idx + 1, filePath: p.photo.file_path }))

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
  console.log(`   Total Media Items:         ${processed.length}`)
  console.log(`   Thumbnail Generation Time: ${thumbDurationSec.toFixed(2)} seconds`)
  console.log(`   Total End-to-End Time:     ${totalDurationSec.toFixed(2)} seconds`)
  console.log(`   Average Speed per Item:    ${(thumbDurationSec / processed.length * 1000).toFixed(1)} ms/item`)
  console.log(`======================================================\n`)

  if (totalDurationSec <= 60) {
    console.log(`✅ SUCCESS: Thumbnail generation completed within ${totalDurationSec.toFixed(2)}s (< 60s benchmark target)!`)
    process.exit(0)
  } else {
    console.error(`❌ FAILED: Total time ${totalDurationSec.toFixed(2)}s exceeded 60s limit!`)
    process.exit(1)
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err)
  process.exit(1)
})
