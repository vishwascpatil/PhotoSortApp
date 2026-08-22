#!/usr/bin/env node
import { existsSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join, resolve, extname, basename } from 'path'
import {
  detectDocument,
  DOCUMENT_SCORE_THRESHOLD,
  BLUR_THRESHOLD
} from '../src/main/services/document/documentDetector.ts'
import type { DocumentDetectionResult } from '../src/main/services/document/documentDetector.ts'

// ─── Interfaces ───────────────────────────────────────────────────────────

interface LabeledSample {
  filePath: string
  filename: string
  expectedIsDoc: boolean
  group: 'documents' | 'non-documents' | 'edge-cases'
  result?: DocumentDetectionResult
  error?: string
}

interface StatisticalSummary {
  count: number
  min: number
  max: number
  mean: number
  median: number
  stdDev: number
}

interface ThresholdMetrics {
  threshold: number
  tp: number
  fp: number
  tn: number
  fn: number
  precision: number
  recall: number
  f1: number
  accuracy: number
}

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.heic', '.tiff'])

// ─── Math & Statistical Helpers ───────────────────────────────────────────

function computeStats(numbers: number[]): StatisticalSummary {
  if (numbers.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, median: 0, stdDev: 0 }
  }

  const sorted = [...numbers].sort((a, b) => a - b)
  const count = sorted.length
  const min = sorted[0]
  const max = sorted[count - 1]
  const sum = sorted.reduce((a, b) => a + b, 0)
  const mean = sum / count

  let median = 0
  const mid = Math.floor(count / 2)
  if (count % 2 === 0) {
    median = (sorted[mid - 1] + sorted[mid]) / 2
  } else {
    median = sorted[mid]
  }

  const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count
  const stdDev = Math.sqrt(variance)

  return {
    count,
    min: Math.round(min * 10) / 10,
    max: Math.round(max * 10) / 10,
    mean: Math.round(mean * 10) / 10,
    median: Math.round(median * 10) / 10,
    stdDev: Math.round(stdDev * 10) / 10
  }
}

function calculateMetricsAtThreshold(samples: LabeledSample[], threshold: number): ThresholdMetrics {
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0

  for (const sample of samples) {
    if (!sample.result) continue
    const predictedIsDoc = sample.result.confidence >= threshold

    if (sample.expectedIsDoc && predictedIsDoc) tp++
    else if (!sample.expectedIsDoc && predictedIsDoc) fp++
    else if (!sample.expectedIsDoc && !predictedIsDoc) tn++
    else if (sample.expectedIsDoc && !predictedIsDoc) fn++
  }

  const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0
  const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0
  const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0
  const total = tp + fp + tn + fn
  const accuracy = total > 0 ? (tp + tn) / total : 0

  return {
    threshold,
    tp,
    fp,
    tn,
    fn,
    precision: Math.round(precision * 1000) / 10,
    recall: Math.round(recall * 1000) / 10,
    f1: Math.round(f1 * 1000) / 10,
    accuracy: Math.round(accuracy * 1000) / 10
  }
}

// ─── File Discovery ───────────────────────────────────────────────────────

function getImagesRecursively(dirPath: string): string[] {
  if (!existsSync(dirPath)) return []
  const results: string[] = []

  function scan(current: string) {
    const entries = readdirSync(current)
    for (const entry of entries) {
      const fullPath = join(current, entry)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          scan(fullPath)
        } else if (stat.isFile()) {
          const ext = extname(entry).toLowerCase()
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            results.push(fullPath)
          }
        }
      } catch {}
    }
  }

  scan(dirPath)
  return results
}

// ─── Main Calibration Runner ──────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const calibrationRoot = resolve(args[0] || './calibration-set')
  const outputFile = resolve(args[1] || './calibration-results.json')

  console.log('\n' + '='.repeat(80))
  console.log('  PHOTOSORT DOCUMENT DETECTION CALIBRATION TEST HARNESS')
  console.log('='.repeat(80))
  console.log(`📁 Calibration Directory : ${calibrationRoot}`)
  console.log(`💾 JSON Export Output    : ${outputFile}`)
  console.log(`⚙️  Current Default Threshold: ${DOCUMENT_SCORE_THRESHOLD} pts | Blur Threshold: ${BLUR_THRESHOLD}`)
  console.log('-'.repeat(80))

  const docsDir = join(calibrationRoot, 'documents')
  const nonDocsDir = join(calibrationRoot, 'non-documents')
  const edgeCasesDir = join(calibrationRoot, 'edge-cases')

  if (!existsSync(calibrationRoot)) {
    console.error(`\n❌ Error: Calibration directory does not exist: "${calibrationRoot}"`)
    console.log('\nPlease create the directory with the following structure:')
    console.log('  /calibration-set')
    console.log('    /documents       (ground truth positive documents/ID cards)')
    console.log('    /non-documents   (ground truth negative photos/screenshots/memes)')
    console.log('    /edge-cases      (challenging edge cases for manual review)\n')
    process.exit(1)
  }

  const docFiles = getImagesRecursively(docsDir)
  const nonDocFiles = getImagesRecursively(nonDocsDir)
  const edgeCaseFiles = getImagesRecursively(edgeCasesDir)

  console.log(`📊 Found ${docFiles.length} documents, ${nonDocFiles.length} non-documents, and ${edgeCaseFiles.length} edge-cases.\n`)

  const samples: LabeledSample[] = [
    ...docFiles.map(f => ({ filePath: f, filename: basename(f), expectedIsDoc: true, group: 'documents' as const })),
    ...nonDocFiles.map(f => ({ filePath: f, filename: basename(f), expectedIsDoc: false, group: 'non-documents' as const }))
  ]

  let skippedCount = 0
  const mainResults: LabeledSample[] = []

  // 1. Process Main Evaluation Set
  console.log('🔄 Running Document Detection on Ground Truth Samples...')
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    const progress = `[${i + 1}/${samples.length}]`
    process.stdout.write(`\r  ${progress} Processing ${sample.group}/${sample.filename.padEnd(35).slice(0, 35)}...`)

    try {
      const result = await detectDocument(sample.filePath)
      sample.result = result
      mainResults.push(sample)
    } catch (err: any) {
      sample.error = err?.message || String(err)
      skippedCount++
      console.log(`\n  ⚠️  Failed to analyze ${sample.filename}: ${sample.error}`)
    }
  }
  process.stdout.write('\r  ✅ Main sample evaluation completed.                                         \n\n')

  // 2. Process Edge Cases (For qualitative inspection)
  const edgeResults: LabeledSample[] = []
  if (edgeCaseFiles.length > 0) {
    console.log('🔍 Running Analysis on Edge Cases...')
    for (let i = 0; i < edgeCaseFiles.length; i++) {
      const f = edgeCaseFiles[i]
      const name = basename(f)
      process.stdout.write(`\r  [${i + 1}/${edgeCaseFiles.length}] Analyzing edge-cases/${name.padEnd(35).slice(0, 35)}...`)
      try {
        const result = await detectDocument(f)
        edgeResults.push({
          filePath: f,
          filename: name,
          expectedIsDoc: true,
          group: 'edge-cases',
          result
        })
      } catch (err: any) {
        console.log(`\n  ⚠️  Edge case skipped ${name}: ${err?.message || err}`)
      }
    }
    process.stdout.write('\r  ✅ Edge case inspection completed.                                           \n\n')
  }

  // ─── Statistical Analysis ─────────────────────────────────────────────────

  const validDocs = mainResults.filter(s => s.expectedIsDoc && s.result)
  const validNonDocs = mainResults.filter(s => !s.expectedIsDoc && s.result)

  const docScores = validDocs.map(s => s.result!.confidence)
  const docOcrScores = validDocs.map(s => s.result!.ocrQualityScore)

  const nonDocScores = validNonDocs.map(s => s.result!.confidence)
  const nonDocOcrScores = validNonDocs.map(s => s.result!.ocrQualityScore)

  const docStats = computeStats(docScores)
  const docOcrStats = computeStats(docOcrScores)
  const nonDocStats = computeStats(nonDocScores)
  const nonDocOcrStats = computeStats(nonDocOcrScores)

  // ─── Display Summary Tables ───────────────────────────────────────────────

  console.log('='.repeat(80))
  console.log('1. SCORE DISTRIBUTIONS')
  console.log('='.repeat(80))
  console.log('Group           | Metric            | Min   | Max   | Mean  | Median | StdDev')
  console.log('-'.repeat(80))
  console.log(`Documents (${docStats.count.toString().padEnd(3)})  | Raw Confidence    | ${docStats.min.toFixed(1).padEnd(5)} | ${docStats.max.toFixed(1).padEnd(5)} | ${docStats.mean.toFixed(1).padEnd(5)} | ${docStats.median.toFixed(1).padEnd(6)} | ${docStats.stdDev.toFixed(1)}`)
  console.log(`Documents (${docStats.count.toString().padEnd(3)})  | OCR Quality Score | ${docOcrStats.min.toFixed(1).padEnd(5)} | ${docOcrStats.max.toFixed(1).padEnd(5)} | ${docOcrStats.mean.toFixed(1).padEnd(5)} | ${docOcrStats.median.toFixed(1).padEnd(6)} | ${docOcrStats.stdDev.toFixed(1)}`)
  console.log('-'.repeat(80))
  console.log(`Non-Docs  (${nonDocStats.count.toString().padEnd(3)})  | Raw Confidence    | ${nonDocStats.min.toFixed(1).padEnd(5)} | ${nonDocStats.max.toFixed(1).padEnd(5)} | ${nonDocStats.mean.toFixed(1).padEnd(5)} | ${nonDocStats.median.toFixed(1).padEnd(6)} | ${nonDocStats.stdDev.toFixed(1)}`)
  console.log(`Non-Docs  (${nonDocStats.count.toString().padEnd(3)})  | OCR Quality Score | ${nonDocOcrStats.min.toFixed(1).padEnd(5)} | ${nonDocOcrStats.max.toFixed(1).padEnd(5)} | ${nonDocOcrStats.mean.toFixed(1).padEnd(5)} | ${nonDocOcrStats.median.toFixed(1).padEnd(6)} | ${nonDocOcrStats.stdDev.toFixed(1)}`)
  console.log('='.repeat(80) + '\n')

  // ─── Current Threshold Performance ────────────────────────────────────────

  const currentMetrics = calculateMetricsAtThreshold(mainResults, DOCUMENT_SCORE_THRESHOLD)
  console.log('='.repeat(80))
  console.log(`2. CLASSIFICATION METRICS AT CURRENT THRESHOLD (${DOCUMENT_SCORE_THRESHOLD})`)
  console.log('='.repeat(80))
  console.log(`  • Precision : ${currentMetrics.precision}% (TP: ${currentMetrics.tp}, FP: ${currentMetrics.fp})`)
  console.log(`  • Recall    : ${currentMetrics.recall}% (TP: ${currentMetrics.tp}, FN: ${currentMetrics.fn})`)
  console.log(`  • F1 Score  : ${currentMetrics.f1}%`)
  console.log(`  • Accuracy  : ${currentMetrics.accuracy}% (Total evaluated: ${mainResults.length})`)
  console.log('='.repeat(80) + '\n')

  // ─── Threshold Sweep ──────────────────────────────────────────────────────

  const sweepThresholds = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70]
  const sweepResults: ThresholdMetrics[] = sweepThresholds.map(t => calculateMetricsAtThreshold(mainResults, t))

  // Find optimal threshold by highest F1 score
  let bestThreshold = sweepResults[0]
  for (const s of sweepResults) {
    if (s.f1 > bestThreshold.f1) {
      bestThreshold = s
    }
  }

  console.log('='.repeat(80))
  console.log('3. THRESHOLD SWEEP ANALYSIS (20 - 70)')
  console.log('='.repeat(80))
  console.log('Threshold | Precision (%) | Recall (%) | F1 Score (%) | Accuracy (%) | TP | FP | FN')
  console.log('-'.repeat(80))
  for (const s of sweepResults) {
    const isCurrent = s.threshold === DOCUMENT_SCORE_THRESHOLD ? ' <- CURRENT' : ''
    const isBest = s.threshold === bestThreshold.threshold ? ' ⭐ OPTIMAL' : ''
    const flag = isBest || isCurrent
    console.log(
      `   ${s.threshold.toString().padEnd(6)} | ` +
      `${s.precision.toFixed(1).padEnd(13)} | ` +
      `${s.recall.toFixed(1).padEnd(10)} | ` +
      `${s.f1.toFixed(1).padEnd(12)} | ` +
      `${s.accuracy.toFixed(1).padEnd(12)} | ` +
      `${s.tp.toString().padEnd(2)} | ` +
      `${s.fp.toString().padEnd(2)} | ` +
      `${s.fn.toString().padEnd(2)}${flag}`
    )
  }
  console.log('='.repeat(80))
  console.log(`💡 Recommendation: Optimal F1 score (${bestThreshold.f1}%) achieved at DOCUMENT_SCORE_THRESHOLD = ${bestThreshold.threshold}`)
  console.log('='.repeat(80) + '\n')

  // ─── Blur Threshold Sweep ─────────────────────────────────────────────────

  console.log('='.repeat(80))
  console.log('4. BLUR DETECTION SENSITIVITY')
  console.log('='.repeat(80))
  const totalBlurry = mainResults.filter(s => s.result?.qualityFlags.blurry).length
  console.log(`Total images flagged as blurry at current BLUR_THRESHOLD (${BLUR_THRESHOLD}): ${totalBlurry}/${mainResults.length}`)
  const blurryDocs = validDocs.filter(s => s.result?.qualityFlags.blurry).length
  const blurryNonDocs = validNonDocs.filter(s => s.result?.qualityFlags.blurry).length
  console.log(`  • In Documents    : ${blurryDocs}/${validDocs.length} (${validDocs.length > 0 ? Math.round((blurryDocs / validDocs.length) * 100) : 0}%)`)
  console.log(`  • In Non-Documents: ${blurryNonDocs}/${validNonDocs.length} (${validNonDocs.length > 0 ? Math.round((blurryNonDocs / validNonDocs.length) * 100) : 0}%)`)
  console.log('='.repeat(80) + '\n')

  // ─── Error Analysis: False Positives & False Negatives ────────────────────

  const falsePositives = validNonDocs.filter(s => s.result!.confidence >= DOCUMENT_SCORE_THRESHOLD)
  const falseNegatives = validDocs.filter(s => s.result!.confidence < DOCUMENT_SCORE_THRESHOLD)

  console.log('='.repeat(80))
  console.log(`5. ERROR ANALYSIS: FALSE POSITIVES (${falsePositives.length})`)
  console.log('='.repeat(80))
  if (falsePositives.length === 0) {
    console.log('  🎉 No False Positives detected in non-documents set!')
  } else {
    for (const fp of falsePositives) {
      console.log(`  ❌ [Score: ${fp.result!.confidence}, Type: ${fp.result!.classification}] ${fp.filename}`)
      for (const sig of fp.result!.matchedSignals) {
        console.log(`     - ${sig.signal} (+${sig.points}): ${sig.reason}`)
      }
    }
  }
  console.log('-'.repeat(80))

  console.log(`\n5b. ERROR ANALYSIS: FALSE NEGATIVES (${falseNegatives.length})`)
  console.log('-'.repeat(80))
  if (falseNegatives.length === 0) {
    console.log('  🎉 No False Negatives detected in documents set!')
  } else {
    for (const fn of falseNegatives) {
      console.log(`  ⚠️  [Score: ${fn.result!.confidence}, OCR: ${fn.result!.ocrQualityScore}%] ${fn.filename}`)
      console.log(`     Quality Flags: ${JSON.stringify(fn.result!.qualityFlags)}`)
      if (fn.result!.matchedSignals.length > 0) {
        for (const sig of fn.result!.matchedSignals) {
          console.log(`     - ${sig.signal} (${sig.points}): ${sig.reason}`)
        }
      } else {
        console.log('     - Early rejected in Phase 1 (No quadrilateral or edge density match)')
      }
    }
  }
  console.log('='.repeat(80) + '\n')

  // ─── Edge Cases Inspection Table ──────────────────────────────────────────

  if (edgeResults.length > 0) {
    console.log('='.repeat(80))
    console.log(`6. EDGE-CASES MANUAL INSPECTION (${edgeResults.length} files)`)
    console.log('='.repeat(80))
    for (const ec of edgeResults) {
      const res = ec.result!
      const flags = [
        res.qualityFlags.perspectiveCorrected ? 'PerspectiveWarp' : null,
        res.qualityFlags.blurry ? 'Blurry' : null,
        res.qualityFlags.glareDetected ? 'Glare' : null,
        res.qualityFlags.lowResolution ? 'Upscaled2x' : null
      ].filter(Boolean).join(', ') || 'Normal'

      console.log(`  📄 ${ec.filename}`)
      console.log(`     Score: ${res.confidence}/100 | OCR Quality: ${res.ocrQualityScore}% | Classification: ${res.classification}`)
      console.log(`     Flags: [${flags}]`)
      if (res.matchedSignals.length > 0) {
        for (const s of res.matchedSignals) {
          console.log(`     • ${s.signal} (${s.points > 0 ? `+${s.points}` : s.points}): ${s.reason}`)
        }
      }
      console.log('')
    }
    console.log('='.repeat(80) + '\n')
  }

  // ─── JSON Export ──────────────────────────────────────────────────────────

  const jsonExport = {
    timestamp: new Date().toISOString(),
    calibrationRoot,
    summary: {
      totalSamples: samples.length,
      evaluated: mainResults.length,
      skippedErrors: skippedCount,
      currentThreshold: DOCUMENT_SCORE_THRESHOLD,
      optimalThreshold: bestThreshold.threshold,
      optimalF1: bestThreshold.f1
    },
    distributions: {
      documents: { confidence: docStats, ocrQuality: docOcrStats },
      nonDocuments: { confidence: nonDocStats, ocrQuality: nonDocOcrStats }
    },
    currentThresholdMetrics: currentMetrics,
    thresholdSweep: sweepResults,
    falsePositives: falsePositives.map(fp => ({
      filename: fp.filename,
      filePath: fp.filePath,
      score: fp.result?.confidence,
      classification: fp.result?.classification,
      signals: fp.result?.matchedSignals
    })),
    falseNegatives: falseNegatives.map(fn => ({
      filename: fn.filename,
      filePath: fn.filePath,
      score: fn.result?.confidence,
      ocrQuality: fn.result?.ocrQualityScore,
      classification: fn.result?.classification,
      qualityFlags: fn.result?.qualityFlags,
      signals: fn.result?.matchedSignals
    })),
    edgeCases: edgeResults.map(ec => ({
      filename: ec.filename,
      filePath: ec.filePath,
      result: ec.result
    }))
  }

  writeFileSync(outputFile, JSON.stringify(jsonExport, null, 2), 'utf-8')
  console.log(`📁 Detailed results saved to: ${outputFile}\n`)
}

main().catch(err => {
  console.error('\nFatal calibration harness error:', err)
  process.exit(1)
})
