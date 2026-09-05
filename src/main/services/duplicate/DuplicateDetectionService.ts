import {
  IDuplicateDetectionService,
  PhotoFingerprintRecord,
  DuplicatePair,
  ConfidenceLevel
} from './types'
import { defaultHashService } from './HashService'
import { defaultPerceptualHashService } from './PerceptualHashService'
import { defaultVideoFingerprintService } from './VideoFingerprintService'
import { defaultFeatureVectorService } from './FeatureVectorService'
import { isVideoFile } from './mediaTypes'

export class DuplicateDetectionService implements IDuplicateDetectionService {
  async evaluatePair(r1: PhotoFingerprintRecord, r2: PhotoFingerprintRecord): Promise<DuplicatePair | null> {
    const isVideo1 = this.isVideoRecord(r1)
    const isVideo2 = this.isVideoRecord(r2)

    // Stage 1 & 6: Video Duplicate Pipeline
    if (isVideo1 || isVideo2) {
      if (isVideo1 && isVideo2) {
        return this.evaluateVideoPair(r1, r2)
      }
      return null // Don't mix videos and images
    }

    // Image Duplicate Pipeline
    return this.evaluateImagePair(r1, r2)
  }

  private isVideoRecord(r: PhotoFingerprintRecord): boolean {
    return isVideoFile(r.mimeType || r.filePath)
  }

  private async evaluateImagePair(
    r1: PhotoFingerprintRecord,
    r2: PhotoFingerprintRecord
  ): Promise<DuplicatePair | null> {
    const matchReasons: string[] = []

    // Stage 2: SHA-256 Binary Check
    if (r1.sha256 && r2.sha256 && r1.sha256 === r2.sha256) {
      matchReasons.push('100% Binary SHA-256 Digest Match')
      return {
        photo1Id: r1.photoId,
        photo2Id: r2.photoId,
        confidence: 100,
        confidenceLabel: '100% Exact Duplicate',
        matchReasons,
        isExact: true,
        isVideo: false
      }
    }

    if (r1.partialSha256 && r2.partialSha256 && r1.partialSha256 === r2.partialSha256 && r1.fileSize === r2.fileSize) {
      matchReasons.push('99% Partial Binary Digest & File Size Match')
      return {
        photo1Id: r1.photoId,
        photo2Id: r2.photoId,
        confidence: 99,
        confidenceLabel: '99% Binary Match',
        matchReasons,
        isExact: true,
        isVideo: false
      }
    }

    // Content-Based On-The-Fly Binary Digest Verification (100% Filename Independent)
    if (r1.fileSize && r2.fileSize && r1.fileSize === r2.fileSize && r1.fileSize > 0) {
      const p1 = r1.partialSha256 || await defaultHashService.computePartialSha256(r1.filePath)
      const p2 = r2.partialSha256 || await defaultHashService.computePartialSha256(r2.filePath)
      if (p1 && p2 && p1 === p2) {
        const s1 = r1.sha256 || await defaultHashService.computeSha256(r1.filePath)
        const s2 = r2.sha256 || await defaultHashService.computeSha256(r2.filePath)
        if (s1 && s2 && s1 === s2) {
          matchReasons.push('100% Binary SHA-256 Digest Match')
          return {
            photo1Id: r1.photoId,
            photo2Id: r2.photoId,
            confidence: 100,
            confidenceLabel: '100% Exact Duplicate',
            matchReasons,
            isExact: true,
            isVideo: false
          }
        }
      }
    }

    // Image File Copy Name Pattern Matcher (e.g. images - Copy.webp vs images - Copy - Copy.webp, IMG_E5468 - Copy.HEIC vs IMG_E5468.HEIC)
    const name1 = r1.filePath.replace(/\\/g, '/').split('/').pop() || ''
    const name2 = r2.filePath.replace(/\\/g, '/').split('/').pop() || ''
    const ext1 = name1.includes('.') ? name1.substring(name1.lastIndexOf('.')).toLowerCase() : ''
    const ext2 = name2.includes('.') ? name2.substring(name2.lastIndexOf('.')).toLowerCase() : ''

    const clean1 = name1.substring(0, name1.includes('.') ? name1.lastIndexOf('.') : name1.length).toLowerCase().replace(/(\s*-\s*copy|\s*\(\d+\))+/gi, '').trim()
    const clean2 = name2.substring(0, name2.includes('.') ? name2.lastIndexOf('.') : name2.length).toLowerCase().replace(/(\s*-\s*copy|\s*\(\d+\))+/gi, '').trim()

    if (ext1 === ext2 && clean1 && clean2 && clean1 === clean2 && clean1.length > 1) {
      const isSameSize = r1.fileSize === r2.fileSize || (r1.fileSize && r2.fileSize && Math.abs(r1.fileSize - r2.fileSize) < 1024)
      matchReasons.push(`File Copy Pattern Match (${name1} vs ${name2})`)
      return {
        photo1Id: r1.photoId,
        photo2Id: r2.photoId,
        confidence: isSameSize ? 100 : 99,
        confidenceLabel: isSameSize ? '100% Exact Duplicate' : '99% Binary Match',
        matchReasons,
        isExact: true,
        isVideo: false
      }
    }

    // Stage 3 & 4: Multi-Hash Perceptual Comparison (dHash, pHash DCT, aHash, BlockHash)
    let dHashDist = 999
    if (r1.dhash && r2.dhash && r1.dhash.length === 64 && r2.dhash.length === 64) {
      dHashDist = defaultPerceptualHashService.hammingDistance(r1.dhash, r2.dhash)
    }

    let pHashDist = 999
    if (r1.phash && r2.phash && r1.phash.length === 16 && r2.phash.length === 16) {
      pHashDist = defaultPerceptualHashService.hammingDistance(r1.phash, r2.phash)
    }

    let aHashDist = 999
    if (r1.ahash && r2.ahash && r1.ahash.length === 16 && r2.ahash.length === 16) {
      aHashDist = defaultPerceptualHashService.hammingDistance(r1.ahash, r2.ahash)
    }

    // Check Rotation & Flip Invariance if standard distance is borderline and pHash matches
    let minDHashDist = dHashDist
    if (dHashDist > 14 && dHashDist <= 26 && pHashDist <= 8) {
      try {
        const rotTarget = r2.thumbnailPath || r2.filePath
        const rotVariants = await defaultPerceptualHashService.computeRotationVariants(rotTarget)
        if (rotVariants) {
          const distances = [
            defaultPerceptualHashService.hammingDistance(r1.dhash!, rotVariants.rot90),
            defaultPerceptualHashService.hammingDistance(r1.dhash!, rotVariants.rot180),
            defaultPerceptualHashService.hammingDistance(r1.dhash!, rotVariants.rot270),
            defaultPerceptualHashService.hammingDistance(r1.dhash!, rotVariants.flipH),
            defaultPerceptualHashService.hammingDistance(r1.dhash!, rotVariants.flipV)
          ]
          const minRot = Math.min(...distances)
          if (minRot < minDHashDist) {
            minDHashDist = minRot
            matchReasons.push(`Rotated/Mirrored Duplicate Detected (Gradient Hamming Distance: ${minRot})`)
          }
        }
      } catch {}
    }

    // Aspect Ratio Check (allow subtle crop up to 20%)
    const ar1 = r1.width > 0 && r1.height > 0 ? r1.width / r1.height : null
    const ar2 = r2.width > 0 && r2.height > 0 ? r2.width / r2.height : null
    if (ar1 !== null && ar2 !== null && Math.abs(ar1 - ar2) > 0.20) {
      return null // Reject if aspect ratio differs vastly
    }

    // 95% Visually Identical (Different format JPEG/PNG/WEBP/HEIC or lossless re-export)
    if (minDHashDist <= 8 || (minDHashDist <= 12 && pHashDist <= 4)) {
      matchReasons.push(`Visually Identical Content (dHash Distance: ${minDHashDist}, pHash: ${pHashDist})`)
      return {
        photo1Id: r1.photoId,
        photo2Id: r2.photoId,
        confidence: 95,
        confidenceLabel: '95% Visually Identical',
        matchReasons,
        isExact: false,
        isVideo: false
      }
    }

    // 90% Same Image Different Compression
    if (minDHashDist <= 16 || (minDHashDist <= 20 && pHashDist <= 6)) {
      matchReasons.push(`Same Image Re-compressed/Exported (dHash Distance: ${minDHashDist})`)
      return {
        photo1Id: r1.photoId,
        photo2Id: r2.photoId,
        confidence: 90,
        confidenceLabel: '90% Same Image Different Compression',
        matchReasons,
        isExact: false,
        isVideo: false
      }
    }

    // 85% Same Image Different Resolution (4K vs 1080p vs 720p)
    if (minDHashDist <= 24 && pHashDist <= 10) {
      matchReasons.push(`Different Resolution Variant (${r1.width}x${r1.height} vs ${r2.width}x${r2.height})`)
      return {
        photo1Id: r1.photoId,
        photo2Id: r2.photoId,
        confidence: 85,
        confidenceLabel: '85% Same Image Different Resolution',
        matchReasons,
        isExact: false,
        isVideo: false
      }
    }

    // Stage 5: Feature Vector & Color Histogram SSIM Check for Slightly Edited / Brightened / Filtered Images
    if (minDHashDist <= 36) {
      let histSim = 0
      if (r1.colorHistogram && r2.colorHistogram && r1.colorHistogram.length === 64 && r2.colorHistogram.length === 64) {
        histSim = defaultFeatureVectorService.compareHistograms(r1.colorHistogram, r2.colorHistogram)
      } else {
        const [h1, h2] = await Promise.all([
          defaultFeatureVectorService.computeColorHistogram(r1.filePath),
          defaultFeatureVectorService.computeColorHistogram(r2.filePath)
        ])
        histSim = defaultFeatureVectorService.compareHistograms(h1, h2)
      }

      if (histSim >= 0.85) {
        matchReasons.push(`Slightly Edited / Filtered Photo (Color Histogram Similarity: ${(histSim * 100).toFixed(1)}%)`)
        return {
          photo1Id: r1.photoId,
          photo2Id: r2.photoId,
          confidence: 80,
          confidenceLabel: '80% Slightly Edited',
          matchReasons,
          isExact: false,
          isVideo: false
        }
      }

      if (histSim >= 0.70) {
        matchReasons.push(`Probable Visual Duplicate (Color Histogram Similarity: ${(histSim * 100).toFixed(1)}%)`)
        return {
          photo1Id: r1.photoId,
          photo2Id: r2.photoId,
          confidence: 75,
          confidenceLabel: '75% Probably Duplicate',
          matchReasons,
          isExact: false,
          isVideo: false
        }
      }
    }

    return null
  }

  private async evaluateVideoPair(
    r1: PhotoFingerprintRecord,
    r2: PhotoFingerprintRecord
  ): Promise<DuplicatePair | null> {
    const matchReasons: string[] = []

    // Stage 2: Binary check for videos
    if (r1.sha256 && r2.sha256 && r1.sha256 === r2.sha256) {
      matchReasons.push('100% Binary SHA-256 Digest Video Match')
      return {
        photo1Id: r1.photoId,
        photo2Id: r2.photoId,
        confidence: 100,
        confidenceLabel: '100% Exact Duplicate',
        matchReasons,
        isExact: true,
        isVideo: true
      }
    }

    // Content-Based On-The-Fly Binary Digest Verification for Videos
    if (r1.fileSize && r2.fileSize && r1.fileSize === r2.fileSize && r1.fileSize > 0) {
      const p1 = r1.partialSha256 || await defaultHashService.computePartialSha256(r1.filePath)
      const p2 = r2.partialSha256 || await defaultHashService.computePartialSha256(r2.filePath)
      if (p1 && p2 && p1 === p2) {
        const s1 = r1.sha256 || await defaultHashService.computeSha256(r1.filePath)
        const s2 = r2.sha256 || await defaultHashService.computeSha256(r2.filePath)
        if (s1 && s2 && s1 === s2) {
          matchReasons.push('100% Binary SHA-256 Video Digest Match')
          return {
            photo1Id: r1.photoId,
            photo2Id: r2.photoId,
            confidence: 100,
            confidenceLabel: '100% Exact Duplicate',
            matchReasons,
            isExact: true,
            isVideo: true
          }
        }
      }
    }

    // Video File Copy Name Pattern Matcher (e.g. IMG_3037 - Copy.MOV vs IMG_3037 - Copy (2).MOV)
    const name1 = r1.filePath.replace(/\\/g, '/').split('/').pop() || ''
    const name2 = r2.filePath.replace(/\\/g, '/').split('/').pop() || ''
    const ext1 = name1.substring(name1.lastIndexOf('.')).toLowerCase()
    const ext2 = name2.substring(name2.lastIndexOf('.')).toLowerCase()

    const clean1 = name1.substring(0, name1.lastIndexOf('.')).toLowerCase().replace(/(\s*-\s*copy|\s*\(\d+\))+/gi, '').trim()
    const clean2 = name2.substring(0, name2.lastIndexOf('.')).toLowerCase().replace(/(\s*-\s*copy|\s*\(\d+\))+/gi, '').trim()

    if (ext1 === ext2 && clean1 && clean2 && clean1 === clean2 && clean1.length > 2) {
      matchReasons.push(`Video File Copy Pattern Match (${name1} vs ${name2})`)
      return {
        photo1Id: r1.photoId,
        photo2Id: r2.photoId,
        confidence: 99,
        confidenceLabel: '99% Binary Match',
        matchReasons,
        isExact: true,
        isVideo: true
      }
    }

    // Stage 6: Multi-Keyframe Video Fingerprint Vector Check
    let v1 = {
      duration: r1.videoDuration || 0,
      keyframes: r1.videoKeyframes || [],
      dhash: r1.dhash,
      phash: r1.phash
    }
    let v2 = {
      duration: r2.videoDuration || 0,
      keyframes: r2.videoKeyframes || [],
      dhash: r2.dhash,
      phash: r2.phash
    }

    if (!v1.dhash && !v1.duration) v1 = await defaultVideoFingerprintService.computeVideoFingerprint(r1.filePath)
    if (!v2.dhash && !v2.duration) v2 = await defaultVideoFingerprintService.computeVideoFingerprint(r2.filePath)

    const vResult = defaultVideoFingerprintService.compareVideoFingerprints(v1, v2)
    if (vResult.isDuplicate) {
      const confidenceLabel: ConfidenceLevel =
        vResult.confidence >= 95
          ? '95% Visually Identical'
          : vResult.confidence >= 90
          ? '90% Same Image Different Compression'
          : '85% Same Image Different Resolution'

      return {
        photo1Id: r1.photoId,
        photo2Id: r2.photoId,
        confidence: vResult.confidence,
        confidenceLabel,
        matchReasons: vResult.reasons,
        isExact: false,
        isVideo: true
      }
    }

    return null
  }
}

export const defaultDuplicateDetectionService = new DuplicateDetectionService()
