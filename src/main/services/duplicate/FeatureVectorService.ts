import sharp from 'sharp'
import fs from 'fs'
import { IFeatureVectorService } from './types'

export class FeatureVectorService implements IFeatureVectorService {
  private histogramCache = new Map<string, number[]>()

  async computeColorHistogram(imagePath: string, thumbnailPath?: string | null): Promise<number[]> {
    return this.computeHsvHistogram(imagePath, thumbnailPath)
  }

  async computeRgbHistogram(imagePath: string, thumbnailPath?: string | null): Promise<number[]> {
    return this.computeHsvHistogram(imagePath, thumbnailPath)
  }

  async computeHsvHistogram(imagePath: string, thumbnailPath?: string | null): Promise<number[]> {
    const targetPath = (thumbnailPath && fs.existsSync(thumbnailPath)) ? thumbnailPath : imagePath
    if (this.histogramCache.has(targetPath)) {
      return this.histogramCache.get(targetPath)!
    }
    try {
      const { data } = await sharp(targetPath, { failOn: 'none' })
        .resize(128, 128, { fit: 'fill' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      const bins = new Float64Array(64)
      const totalPixels = data.length / 4

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] / 255
        const g = data[i + 1] / 255
        const b = data[i + 2] / 255

        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const delta = max - min

        let h = 0
        if (delta > 0) {
          if (max === r) h = ((g - b) / delta) % 6
          else if (max === g) h = (b - r) / delta + 2
          else h = (r - g) / delta + 4
          h = Math.round(h * 60)
          if (h < 0) h += 360
        }

        const s = max === 0 ? 0 : delta / max
        const v = max

        const hBin = Math.min(7, Math.floor(h / 45))
        const sBin = Math.min(3, Math.floor(s * 4))
        const vBin = Math.min(1, Math.floor(v * 2))

        const index = hBin * 8 + sBin * 2 + vBin
        bins[index] += 1
      }

      const histogram: number[] = new Array(64)
      for (let i = 0; i < 64; i++) {
        histogram[i] = bins[i] / totalPixels
      }
      this.histogramCache.set(targetPath, histogram)
      return histogram
    } catch {
      const empty = new Array(64).fill(0)
      this.histogramCache.set(targetPath, empty)
      return empty
    }
  }

  async computeEdgeHistogram(imagePath: string): Promise<number[]> {
    try {
      const { data } = await sharp(imagePath, { failOn: 'none' })
        .resize(64, 64, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true })

      const bins = new Float64Array(32)
      let totalEdges = 0

      for (let r = 1; r < 63; r++) {
        for (let c = 1; c < 63; c++) {
          const idx = r * 64 + c
          const gx = data[idx + 1] - data[idx - 1]
          const gy = data[idx + 64] - data[idx - 64]
          const mag = Math.sqrt(gx * gx + gy * gy)

          if (mag > 20) {
            let angle = Math.atan2(gy, gx) * (180 / Math.PI)
            if (angle < 0) angle += 180
            const bin = Math.min(31, Math.floor((angle / 180) * 32))
            bins[bin] += 1
            totalEdges++
          }
        }
      }

      const histogram: number[] = new Array(32)
      const norm = totalEdges > 0 ? totalEdges : 1
      for (let i = 0; i < 32; i++) {
        histogram[i] = bins[i] / norm
      }
      return histogram
    } catch {
      return new Array(32).fill(0)
    }
  }

  /**
   * Calculates Histogram Intersection Coefficient (returns 0.0 to 1.0)
   */
  compareHistograms(h1: number[], h2: number[]): number {
    if (!h1 || !h2 || h1.length !== h2.length || h1.length === 0) return 0
    let intersection = 0
    for (let i = 0; i < h1.length; i++) {
      intersection += Math.min(h1[i], h2[i])
    }
    return Math.min(1.0, Math.max(0.0, intersection))
  }

  /**
   * Computes Structural Similarity Index (SSIM) score on normalized grayscale grids
   */
  async computeSSIMScore(path1: string, path2: string): Promise<number> {
    try {
      const [buf1, buf2] = await Promise.all([
        sharp(path1, { failOn: 'none' }).resize(64, 64, { fit: 'fill' }).grayscale().raw().toBuffer(),
        sharp(path2, { failOn: 'none' }).resize(64, 64, { fit: 'fill' }).grayscale().raw().toBuffer()
      ])

      if (buf1.length !== buf2.length || buf1.length === 0) return 0

      const N = buf1.length
      let mean1 = 0, mean2 = 0
      for (let i = 0; i < N; i++) {
        mean1 += buf1[i]
        mean2 += buf2[i]
      }
      mean1 /= N
      mean2 /= N

      let var1 = 0, var2 = 0, covar = 0
      for (let i = 0; i < N; i++) {
        const d1 = buf1[i] - mean1
        const d2 = buf2[i] - mean2
        var1 += d1 * d1
        var2 += d2 * d2
        covar += d1 * d2
      }
      var1 /= N
      var2 /= N
      covar /= N

      const c1 = 6.5025
      const c2 = 58.5225
      const ssim = ((2 * mean1 * mean2 + c1) * (2 * covar + c2)) / ((mean1 * mean1 + mean2 * mean2 + c1) * (var1 + var2 + c2))
      return Math.min(1.0, Math.max(0.0, ssim))
    } catch {
      return 0
    }
  }
}

export const defaultFeatureVectorService = new FeatureVectorService()
