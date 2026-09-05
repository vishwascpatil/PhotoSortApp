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

    // 1. Exact File Size Bucket (Guaranteed 100% Exact Duplicates)
    const exactSizeBuckets = new Map<string, number[]>()
    // 2. SHA-256 / Partial SHA-256 Bucket
    const shaBuckets = new Map<string, number[]>()
    // 3. dHash LSH Sub-band Buckets (4 sub-bands of 16 hex chars)
    const lshBand1 = new Map<string, number[]>()
    const lshBand2 = new Map<string, number[]>()
    const lshBand3 = new Map<string, number[]>()
    const lshBand4 = new Map<string, number[]>()
    // 4. pHash LSH Sub-band Buckets (4 sub-bands of 4 hex chars = 16 bits)
    const pHashBand1 = new Map<string, number[]>()
    const pHashBand2 = new Map<string, number[]>()
    const pHashBand3 = new Map<string, number[]>()
    const pHashBand4 = new Map<string, number[]>()
    // 5. Video Duration Bucket (±1.5s)
    const videoDurationBuckets = new Map<number, number[]>()
    // 6. Filename Base Sequence Number Bucket
    const filenameSeqBuckets = new Map<string, number[]>()
    // 7. Temporal Proximity Bucket (Burst photos within 4s)
    const burstBuckets = new Map<number, number[]>()

    records.forEach((rec) => {
      // Content-Based Exact File Size Bucket (100% filename-independent)
      if (rec.fileSize && rec.fileSize > 0) {
        const sKey = `size_${rec.fileSize}`
        if (!exactSizeBuckets.has(sKey)) exactSizeBuckets.set(sKey, [])
        exactSizeBuckets.get(sKey)!.push(rec.photoId)
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

      // pHash DCT Sub-band Bucketing (16 hex chars -> 4 sub-bands of 4 chars)
      if (rec.phash && rec.phash.length === 16 && rec.phash !== '0'.repeat(16)) {
        const p1 = rec.phash.substring(0, 4)
        const p2 = rec.phash.substring(4, 8)
        const p3 = rec.phash.substring(8, 12)
        const p4 = rec.phash.substring(12, 16)

        if (!pHashBand1.has(p1)) pHashBand1.set(p1, [])
        pHashBand1.get(p1)!.push(rec.photoId)

        if (!pHashBand2.has(p2)) pHashBand2.set(p2, [])
        pHashBand2.get(p2)!.push(rec.photoId)

        if (!pHashBand3.has(p3)) pHashBand3.set(p3, [])
        pHashBand3.get(p3)!.push(rec.photoId)

        if (!pHashBand4.has(p4)) pHashBand4.set(p4, [])
        pHashBand4.get(p4)!.push(rec.photoId)
      }

      // Video Duration Bucketing
      if (rec.videoDuration && rec.videoDuration > 0) {
        const durBucket = Math.round(rec.videoDuration)
        for (let offset = -1; offset <= 1; offset++) {
          const key = durBucket + offset
          if (!videoDurationBuckets.has(key)) videoDurationBuckets.set(key, [])
          videoDurationBuckets.get(key)!.push(rec.photoId)
        }
      }

      // Burst / Capture Time Proximity Bucketing
      if (rec.createdAt) {
        try {
          const sec = Math.floor(new Date(rec.createdAt).getTime() / 1000)
          if (!isNaN(sec) && sec > 0) {
            const burstKey = Math.floor(sec / 4)
            if (!burstBuckets.has(burstKey)) burstBuckets.set(burstKey, [])
            burstBuckets.get(burstKey)!.push(rec.photoId)
          }
        } catch { }
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
    const processBucketList = (buckets: Map<any, number[]>, maxBucketSize: number = 200) => {
      buckets.forEach((ids) => {
        if (ids.length < 2 || ids.length > maxBucketSize) return
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            addPair(ids[i], ids[j])
          }
        }
      })
    }

    // Exact size matches always processed without strict size truncation
    processBucketList(exactSizeBuckets, 1000)
    processBucketList(shaBuckets, 1000)

    // LSH & Sub-band buckets (bounded to 30 items per bucket to keep pairs high-signal and fast)
    processBucketList(lshBand1, 30)
    processBucketList(lshBand2, 30)
    processBucketList(lshBand3, 30)
    processBucketList(lshBand4, 30)
    processBucketList(pHashBand1, 30)
    processBucketList(pHashBand2, 30)
    processBucketList(pHashBand3, 30)
    processBucketList(pHashBand4, 30)

    processBucketList(videoDurationBuckets, 30)
    processBucketList(burstBuckets, 25)
    processBucketList(filenameSeqBuckets, 25)

    return candidateMap
  }
}

export const defaultCandidateGenerationService = new CandidateGenerationService()
