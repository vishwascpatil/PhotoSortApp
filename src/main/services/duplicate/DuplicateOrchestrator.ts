import {
  PhotoFingerprintRecord,
  DuplicateGroupResult,
  DuplicatePair
} from './types'
import { defaultHashService } from './HashService'
import { defaultPerceptualHashService } from './PerceptualHashService'
import { defaultVideoFingerprintService } from './VideoFingerprintService'
import { defaultFeatureVectorService } from './FeatureVectorService'
import { defaultCandidateGenerationService } from './CandidateGenerationService'
import { defaultDuplicateDetectionService } from './DuplicateDetectionService'
import { defaultDuplicateGroupingService } from './DuplicateGroupingService'

export class DuplicateOrchestrator {
  /**
   * Computes reusable multi-hash fingerprint for a single photo or video
   */
  async computeFingerprint(
    photoId: number,
    filePath: string,
    fileSize: number,
    mimeType: string,
    width: number,
    height: number,
    createdAt: string,
    thumbnailPath?: string | null
  ): Promise<PhotoFingerprintRecord> {
    const isVideo =
      mimeType?.startsWith('video') ||
      ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.m4v', '.webm'].some((ext) =>
        filePath.toLowerCase().endsWith(ext)
      )

    const partialSha256 = await defaultHashService.computePartialSha256(filePath).catch(() => '')

    if (isVideo) {
      const vfp = await defaultVideoFingerprintService.computeVideoFingerprint(filePath, thumbnailPath)
      return {
        photoId,
        filePath,
        fileSize,
        mimeType,
        width,
        height,
        createdAt,
        partialSha256,
        dhash: vfp.dhash,
        phash: vfp.phash,
        videoDuration: vfp.duration,
        videoKeyframes: vfp.keyframes
      }
    }

    const hashes = await defaultPerceptualHashService.computeMultiHashes(filePath, thumbnailPath)

    return {
      photoId,
      filePath,
      fileSize,
      mimeType,
      width,
      height,
      createdAt,
      partialSha256,
      phash: hashes.phash,
      dhash: hashes.dhash,
      ahash: hashes.ahash,
      blockHash: hashes.blockHash
    }
  }

  /**
   * High-Performance 6-Stage Duplicate Engine Pipeline
   */
  async runPipeline(
    records: PhotoFingerprintRecord[],
    onProgress?: (scanned: number, total: number) => void
  ): Promise<DuplicateGroupResult[]> {
    if (records.length < 2) return []

    // Stage 1: Candidate Pair Generation via LSH Bucketing
    const candidateMap = defaultCandidateGenerationService.generateCandidatePairs(records)
    const recordMap = new Map<number, PhotoFingerprintRecord>()
    records.forEach((r) => recordMap.set(r.photoId, r))

    // Flatten candidate pairs into a unique pair array
    const pairList: [PhotoFingerprintRecord, PhotoFingerprintRecord][] = []
    candidateMap.forEach((targetSet, id1Str) => {
      const id1 = parseInt(id1Str, 10)
      const r1 = recordMap.get(id1)
      if (!r1) return

      for (const id2 of targetSet) {
        const r2 = recordMap.get(id2)
        if (r2) {
          pairList.push([r1, r2])
        }
      }
    })

    const totalPairs = pairList.length
    const detectedPairs: DuplicatePair[] = []
    const PAIR_BATCH_SIZE = 50

    for (let i = 0; i < totalPairs; i += PAIR_BATCH_SIZE) {
      const chunk = pairList.slice(i, i + PAIR_BATCH_SIZE)
      const results = await Promise.all(
        chunk.map(([r1, r2]) => defaultDuplicateDetectionService.evaluatePair(r1, r2))
      )
      for (const res of results) {
        if (res) {
          detectedPairs.push(res)
        }
      }

      const evaluatedCount = Math.min(i + chunk.length, totalPairs)
      if (evaluatedCount % 50 === 0 || evaluatedCount === totalPairs) {
        onProgress?.(evaluatedCount, totalPairs)
      }

      // Yield to the Node.js event loop every 50 pairs to guarantee UI stays 60fps and watchdog never triggers
      await new Promise((resolve) => setImmediate(resolve))
    }

    onProgress?.(totalPairs, totalPairs)

    // Stage 7: Graph DSU Clustering & Master Selection
    return defaultDuplicateGroupingService.clusterPairs(records, detectedPairs)
  }
}

export const defaultDuplicateOrchestrator = new DuplicateOrchestrator()
