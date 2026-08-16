import { IQualityScoreService, PhotoFingerprintRecord } from './types'

export class QualityScoreService implements IQualityScoreService {
  /**
   * Computes a comprehensive Quality Score (0.0 to 100.0)
   */
  async calculateQualityScore(record: PhotoFingerprintRecord, blurScore?: number): Promise<number> {
    let score = 0

    // 1. Resolution / Megapixels (0 to 30 points)
    const megapixels = ((record.width || 0) * (record.height || 0)) / 1_000_000
    const resScore = Math.min(30, megapixels * 2.5)
    score += resScore

    // 2. Sharpness / Blur Score (Variance of Laplacian) (0 to 25 points)
    if (blurScore !== undefined && blurScore >= 0) {
      const sharpnessScore = Math.min(25, (blurScore / 300) * 25)
      score += sharpnessScore
    } else {
      score += 15 // Default neutral score if unmeasured
    }

    // 3. File Format Losslessness (0 to 20 points)
    const mime = (record.mimeType || '').toLowerCase()
    const ext = (record.filePath || '').toLowerCase()

    if (mime.includes('raw') || ext.endsWith('.cr2') || ext.endsWith('.nef') || ext.endsWith('.arw') || ext.endsWith('.dng')) {
      score += 20
    } else if (mime.includes('png') || mime.includes('tiff')) {
      score += 18
    } else if (mime.includes('heic') || mime.includes('heif')) {
      score += 16
    } else if (mime.includes('jpeg') || mime.includes('jpg')) {
      score += 14
    } else {
      score += 10
    }

    // 4. File Size / Bitrate (0 to 15 points)
    const sizeMb = (record.fileSize || 0) / (1024 * 1024)
    const sizeScore = Math.min(15, sizeMb * 1.5)
    score += sizeScore

    // 5. Filename & Metadata Completeness (0 to 10 points)
    const isCopyName = /-\s*copy|\(\d+\)/i.test(record.filePath)
    if (!isCopyName) score += 5
    if (record.width > 0 && record.height > 0) score += 5

    return Math.min(100.0, Math.max(0.0, score))
  }

  /**
   * Recommends the highest quality copy in a duplicate cluster as Master
   */
  selectBestMaster(records: PhotoFingerprintRecord[]): PhotoFingerprintRecord {
    if (records.length === 0) throw new Error('Cannot select master from empty array')

    const sorted = [...records].sort((a, b) => {
      const qA = a.qualityScore || 0
      const qB = b.qualityScore || 0
      if (qA !== qB) return qB - qA

      // Fallback: Resolution
      const resA = (a.width || 0) * (a.height || 0)
      const resB = (b.width || 0) * (b.height || 0)
      if (resA !== resB) return resB - resA

      // Fallback: File size
      return (b.fileSize || 0) - (a.fileSize || 0)
    })

    return sorted[0]
  }
}

export const defaultQualityScoreService = new QualityScoreService()
