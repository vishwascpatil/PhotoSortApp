import * as faceapi from '@vladmandic/face-api'
import { getOriginalUrl, getThumbnailUrl } from '../utils/helpers'

const MODEL_URL = typeof window !== 'undefined' && window.location.protocol === 'file:' ? './models' : '/models'
const DISTANCE_THRESHOLD = 0.48 // Balanced clustering threshold

let modelsLoaded = false

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return

  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
  await new Promise((r) => setTimeout(r, 80))

  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
  await new Promise((r) => setTimeout(r, 80))

  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
  await new Promise((r) => setTimeout(r, 80))

  // Warm up tinyFaceDetector with tiny canvas to compile shader kernels before user interaction
  try {
    const dummy = document.createElement('canvas')
    dummy.width = 64
    dummy.height = 64
    await faceapi.detectAllFaces(dummy, new faceapi.TinyFaceDetectorOptions({ inputSize: 128 }))
  } catch {}
  await new Promise((r) => setTimeout(r, 80))

  modelsLoaded = true
}

// Compute Euclidean distance between two 128D descriptors
function euclideanDistance(desc1: Float32Array, desc2: Float32Array): number {
  let sum = 0
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i]
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

export interface ScanProgress {
  scannedCount: number
  totalCount: number
  isScanning: boolean
}

let isScanning = false
let currentProgress: ScanProgress | null = null
type ScanListener = (progress: ScanProgress | null) => void
let listeners: ScanListener[] = []
let onPersonFound: (() => void) | null = null

export function setOnPersonFound(cb: (() => void) | null) {
  onPersonFound = cb
}

export function subscribeToFaceScan(listener: ScanListener) {
  listeners.push(listener)
  listener(currentProgress)
  return () => {
    listeners = listeners.filter(l => l !== listener)
  }
}

function updateProgress(progress: ScanProgress | null) {
  currentProgress = progress
  listeners.forEach(l => l(progress))
}

export async function scanPhotosForFaces(): Promise<void> {
  if (isScanning) return
  isScanning = true

  try {
    await loadFaceModels()

    // Fetch in batches of 100 to prevent loading 500,000 items into renderer memory at once
    let unscanned = await window.photoVault.getUnscannedPhotos(100)
    if (unscanned.length === 0) {
      updateProgress({ scannedCount: 0, totalCount: 0, isScanning: false })
      isScanning = false
      return
    }

    // Pre-load and cache face descriptors once in memory
    const existingRawFaces = await window.photoVault.getAllFaceDescriptors()
    const parsedCache: { photoId: number; personId: number; desc: Float32Array }[] = []
    for (const f of existingRawFaces) {
      try {
        parsedCache.push({
          photoId: f.photo_id,
          personId: f.person_id,
          desc: new Float32Array(JSON.parse(f.descriptor))
        })
      } catch {}
    }

    let scannedCount = 0
    let totalCount = unscanned.length

    updateProgress({ scannedCount, totalCount, isScanning: true })

    while (unscanned.length > 0 && isScanning) {
      for (const photo of unscanned) {
        if (!isScanning) break // ability to cancel immediately

        try {
          const isVideo =
            (photo.mime_type && photo.mime_type.startsWith('video')) ||
            (photo.filename &&
              (photo.filename.endsWith('.mp4') ||
                photo.filename.endsWith('.mov') ||
                photo.filename.endsWith('.mkv') ||
                photo.filename.endsWith('.avi') ||
                photo.filename.endsWith('.wmv')))

          if (photo.is_document === 1 || isVideo) {
            await window.photoVault.markPhotoScanned(photo.id)
            scannedCount++
            updateProgress({ scannedCount, totalCount, isScanning: true })
            continue
          }

          // Load image from local file path via custom protocol wrapper
          const img = new Image()
          img.crossOrigin = 'anonymous'
          const url = getThumbnailUrl(photo.preview_path || photo.thumbnail_path, photo.file_path)

          const loadSuccess = await new Promise<boolean>((resolve) => {
            img.onload = () => resolve(true)
            img.onerror = () => resolve(false)
            img.src = url
          })

          if (!loadSuccess || !isScanning) {
            await window.photoVault.markPhotoScanned(photo.id)
            scannedCount++
            updateProgress({ scannedCount, totalCount, isScanning: true })
            continue
          }

          // Scale down image to 320px max dimension for fast, sub-30ms neural inference
          const maxDim = 320
          let scale = 1
          if (img.width > maxDim || img.height > maxDim) {
            scale = maxDim / Math.max(img.width, img.height)
          }
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(img.width * scale))
          canvas.height = Math.max(1, Math.round(img.height * scale))
          const ctx = canvas.getContext('2d')
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)

          // Yield to browser event loop before neural net execution
          await new Promise((r) => setTimeout(r, 10))
          if (!isScanning) break

          // First pass: fast TinyFaceDetector (sub-25ms)
          const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.55 })
          const fastFaces = await faceapi.detectAllFaces(canvas, options)

          // Only compute full landmarks and 128D descriptors if faces are present
          if (fastFaces && fastFaces.length > 0 && isScanning) {
            // Yield before running heavier landmark & descriptor networks
            await new Promise((r) => setTimeout(r, 20))
            if (!isScanning) break

            const detections = await faceapi
              .detectAllFaces(canvas, options)
              .withFaceLandmarks()
              .withFaceDescriptors()

            if (detections.length > 0 && isScanning) {
              for (const detection of detections) {
                if (detection.detection.box.width < 20 || detection.detection.box.height < 20) {
                  continue
                }

                const desc = detection.descriptor
                let bestMatch = { distance: 1.0, personId: -1 }

                for (const known of parsedCache) {
                  const dist = euclideanDistance(desc, known.desc)
                  if (dist < bestMatch.distance) {
                    bestMatch = { distance: dist, personId: known.personId }
                  }
                }

                let assignedPersonId = bestMatch.personId
                if (bestMatch.distance < DISTANCE_THRESHOLD && assignedPersonId !== -1) {
                  await window.photoVault.saveFaceDescriptor(photo.id, assignedPersonId, Array.from(desc))
                  parsedCache.push({ photoId: photo.id, personId: assignedPersonId, desc: new Float32Array(desc) })
                } else {
                  const box = detection.detection.box
                  const margin = Math.max(box.width, box.height) * 0.2
                  const cropX = Math.max(0, box.x - margin)
                  const cropY = Math.max(0, box.y - margin)
                  const cropW = Math.min(canvas.width - cropX, box.width + margin * 2)
                  const cropH = Math.min(canvas.height - cropY, box.height + margin * 2)

                  const faceCanvas = document.createElement('canvas')
                  faceCanvas.width = Math.max(1, Math.round(cropW))
                  faceCanvas.height = Math.max(1, Math.round(cropH))
                  const faceCtx = faceCanvas.getContext('2d')
                  faceCtx?.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, faceCanvas.width, faceCanvas.height)

                  const faceBase64 = faceCanvas.toDataURL('image/jpeg', 0.7)
                  assignedPersonId = await window.photoVault.createPerson('Unknown Person', photo.id, faceBase64)
                  await window.photoVault.saveFaceDescriptor(photo.id, assignedPersonId, Array.from(desc))
                  parsedCache.push({ photoId: photo.id, personId: assignedPersonId, desc: new Float32Array(desc) })

                  // Clean up face canvas
                  faceCanvas.width = 0
                  faceCanvas.height = 0
                }

                if (onPersonFound) onPersonFound()
              }
            }
          }

          // Clean up main canvas
          canvas.width = 0
          canvas.height = 0
        } catch (err: any) {
          console.warn(`Could not process photo ${photo.id} for faces:`, err?.message || err)
        } finally {
          await window.photoVault.markPhotoScanned(photo.id)
          scannedCount++
          updateProgress({ scannedCount, totalCount, isScanning: true })
          // Yield to browser event loop to guarantee 60 FPS UI responsiveness
          await new Promise((r) => setTimeout(r, 20))
        }
      }

      if (!isScanning) break
      // Fetch next batch of 100 unscanned photos
      unscanned = await window.photoVault.getUnscannedPhotos(100)
      totalCount = scannedCount + unscanned.length
      updateProgress({ scannedCount, totalCount, isScanning: true })
    }
  } catch (err) {
    console.error('Error in face scanning:', err)
  } finally {
    isScanning = false
    updateProgress({ scannedCount: 0, totalCount: 0, isScanning: false })
  }
}

export function stopScanning(): void {
  isScanning = false
}
