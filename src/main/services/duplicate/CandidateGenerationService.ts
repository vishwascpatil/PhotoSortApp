import { ICandidateGenerationService, PhotoFingerprintRecord } from './types'
import { isVideoFile } from './mediaTypes'

export class CandidateGenerationService implements ICandidateGenerationService {
  /**
   * Generates candidate pair candidate sets using LSH projection tables & multi-attribute bucketing.
   * Scales efficiently to 500,000+ files.
   */
  generateCandidatePairs(records: PhotoFingerprintRecord[]): Map<string, Set<number>> {
    const candidateMap = new Map<string, Set<number>>() // Key: photoId string, Value: Set of candidate photoIds

    const addPair = (id1: number, id2: number) => {
      if (id1 === id2) return
      const minId = Math.min(id1, id2)
      const maxId = Math.max(id1, id2)
      const key = `${minId}`
      if (!candidateMap.has(key)) candidateMap.set(key, new Set())
      candidateMap.get(key)!.add(maxId)
    }

    // 1. SHA-256 / Partial SHA-256 Bucket
    const shaBuckets = new Map<string, number[]>()
    // 2. dHash LSH Sub-band Buckets (4 sub-bands of 16 hex chars)
    const lshBand1 = new Map<string, number[]>()
    const lshBand2 = new Map<string, number[]>()
    const lshBand3 = new Map<string, number[]>()
    const lshBand4 = new Map<string, number[]>()
    // 3. Video Duration Bucket (±2s)
    const videoDurationBuckets = new Map<number, number[]>()
    // 4. Filename Base Sequence Number Bucket
    const filenameSeqBuckets = new Map<string, number[]>()

    records.forEach((rec) => {
      // Content-Based Exact File Size Bucket (100% filename-independent)
      if (rec.fileSize && rec.fileSize > 0) {
        const sKey = `size_${rec.fileSize}`
        if (!shaBuckets.has(sKey)) shaBuckets.set(sKey, [])
        shaBuckets.get(sKey)!.push(rec.photoId)
      }

      // SHA-256 / Partial SHA-256 Digest Bucketing (100% filename-independent)
      if (rec.sha256) {
        if (!shaBuckets.has(rec.sha256)) shaBuckets.set(rec.sha256, [])
        shaBuckets.get(rec.sha256)!.push(rec.photoId)
      }
      if (rec.partialSha256) {
        const pKey = `p_${rec.partialSha256}`
        if (!shaBuckets.has(pKey)) shaBuckets.set(pKey, [])
        shaBuckets.get(pKey)!.push(rec.photoId)
      }

      // dHash & Video Keyframe LSH Sub-band bucketing
      const activeHash = rec.dhash || rec.videoKeyframes?.[0] || rec.videoKeyframes?.[1]
      if (activeHash && activeHash.length === 64 && activeHash !== '0'.repeat(64)) {
        const b1 = activeHash.substring(0, 16)
        const b2 = activeHash.substring(16, 32)
        const b3 = activeHash.substring(32, 48)
        const b4 = activeHash.substring(48, 64)

        if (!lshBand1.has(b1)) lshBand1.set(b1, [])
        lshBand1.get(b1)!.push(rec.photoId)

        if (!lshBand2.has(b2)) lshBand2.set(b2, [])
        lshBand2.get(b2)!.push(rec.photoId)

        if (!lshBand3.has(b3)) lshBand3.set(b3, [])
        lshBand3.get(b3)!.push(rec.photoId)

        if (!lshBand4.has(b4)) lshBand4.set(b4, [])
        lshBand4.get(b4)!.push(rec.photoId)
      }

      // Video Duration Bucketing
      if (rec.videoDuration && rec.videoDuration > 0) {
        const durBucket = Math.round(rec.videoDuration)
        for (let offset = -2; offset <= 2; offset++) {
          const key = durBucket + offset
          if (!videoDurationBuckets.has(key)) videoDurationBuckets.set(key, [])
          videoDurationBuckets.get(key)!.push(rec.photoId)
        }
      }

      // Clean Base Filename Bucketing for ALL media (Images & Videos)
      // e.g. "images - Copy - Copy.webp" -> "images.webp"
      // e.g. "IMG_E5468 - Copy.HEIC" -> "img_e5468.heic"
      // e.g. "IMG_5465 - Copy.DNG" -> "img_5465.dng"
      const fileName = rec.filePath.replace(/\\/g, '/').split('/').pop() || ''
      const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase() : ''
      const baseName = fileName
        .substring(0, fileName.includes('.') ? fileName.lastIndexOf('.') : fileName.length)
        .toLowerCase()
        .replace(/(\s*-\s*copy|\s*\(\d+\))+/gi, '')
        .trim()

      if (baseName && baseName.length > 1) {
        const baseKey = `base_${baseName}_${ext}`
        if (!shaBuckets.has(baseKey)) shaBuckets.set(baseKey, [])
        shaBuckets.get(baseKey)!.push(rec.photoId)
      }

      // Filename Sequence Number Bucketing
      const match = fileName.toUpperCase().match(/\d{4,}/)
      if (match) {
        const seq = match[0]
        if (!filenameSeqBuckets.has(seq)) filenameSeqBuckets.set(seq, [])
        filenameSeqBuckets.get(seq)!.push(rec.photoId)
      }
    })

    // Process Buckets into Candidate Pairs
    const processBucketList = (buckets: Map<any, number[]>) => {
      buckets.forEach((ids) => {
        if (ids.length < 2 || ids.length > 200) return
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            addPair(ids[i], ids[j])
          }
        }
      })
    }

    processBucketList(shaBuckets)
    processBucketList(lshBand1)
    processBucketList(lshBand2)
    processBucketList(lshBand3)
    processBucketList(lshBand4)
    processBucketList(videoDurationBuckets)
    processBucketList(filenameSeqBuckets)

    return candidateMap
  }
}

export const defaultCandidateGenerationService = new CandidateGenerationService()
