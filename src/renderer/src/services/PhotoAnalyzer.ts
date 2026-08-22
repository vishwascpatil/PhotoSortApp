import { getThumbnailUrl } from '../utils/helpers'

export interface AnalysisProgress {
  analyzedCount: number
  totalCount: number
  isAnalyzing: boolean
}

let isAnalyzing = false

export function stopAnalyzing(): void {
  isAnalyzing = false
}

// Compute a 64-bit perceptual hash (aHash)
function computeAHash(imageData: ImageData): string {
  const data = imageData.data
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    // Convert to grayscale: 0.299*R + 0.587*G + 0.114*B
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    total += gray
  }
  const average = total / (data.length / 4)
  
  let hash = ''
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    hash += gray >= average ? '1' : '0'
  }
  
  // Convert binary string to hex
  let hexHash = ''
  for (let i = 0; i < hash.length; i += 4) {
    hexHash += parseInt(hash.substr(i, 4), 2).toString(16)
  }
  
  return hexHash
}

// Compute Laplacian variance (sharpness score)
function computeLaplacianVariance(imageData: ImageData, width: number, height: number): number {
  const data = imageData.data
  const gray = new Float32Array(width * height)
  
  for (let i = 0; i < width * height; i++) {
    gray[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114
  }
  
  const laplacian = new Float32Array(width * height)
  let sum = 0
  
  // 3x3 Laplacian kernel
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const val = 
        gray[idx - width] + 
        gray[idx - 1] - 4 * gray[idx] + 
        gray[idx + 1] + 
        gray[idx + width]
        
      laplacian[idx] = val
      sum += val
    }
  }
  
  const mean = sum / (width * height)
  let variance = 0
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const diff = laplacian[idx] - mean
      variance += diff * diff
    }
  }
  
  return variance / (width * height)
}

export async function analyzePhotos(
  onProgress?: (progress: AnalysisProgress) => void
): Promise<void> {
  if (isAnalyzing) return
  isAnalyzing = true

  try {
    const unanalyzed = await window.photoVault.getUnanalyzedPhotos()
    if (unanalyzed.length === 0) {
      onProgress?.({ analyzedCount: 0, totalCount: 0, isAnalyzing: false })
      isAnalyzing = false
      return
    }

    const totalCount = unanalyzed.length
    let analyzedCount = 0

    onProgress?.({ analyzedCount, totalCount, isAnalyzing: true })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    for (const photo of unanalyzed) {
      if (!isAnalyzing) break

      try {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        const url = getThumbnailUrl(photo.thumbnail_path, photo.file_path)
        
        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          img.src = url
        })

        // 1. Calculate aHash (8x8)
        canvas.width = 8
        canvas.height = 8
        ctx.drawImage(img, 0, 0, 8, 8)
        const hashData = ctx.getImageData(0, 0, 8, 8)
        const aHash = computeAHash(hashData)
        
        // 2. Calculate Laplacian variance on a 256x256 scaled down version for speed
        const blurDim = 256
        let scale = 1
        if (img.width > blurDim || img.height > blurDim) {
          scale = blurDim / Math.max(img.width, img.height)
        }
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const blurData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const blurScore = computeLaplacianVariance(blurData, canvas.width, canvas.height)
        
        await window.photoVault.savePhotoAnalysis(photo.id, blurScore, aHash)
      } catch (err) {
        // Mark as processed with fallback values so it doesn't get stuck
        await window.photoVault.savePhotoAnalysis(photo.id, 100, '0000000000000000')
      } finally {
        analyzedCount++
        onProgress?.({ analyzedCount, totalCount, isAnalyzing: true })
      }
    }
  } catch (err) {
    console.error('Analysis failed:', err)
  } finally {
    isAnalyzing = false
    onProgress?.({ analyzedCount: 0, totalCount: 0, isAnalyzing: false })
  }
}
