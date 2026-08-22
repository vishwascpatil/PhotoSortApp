import * as faceapi from '@vladmandic/face-api'
import { getOriginalUrl, getThumbnailUrl } from '../utils/helpers'

const MODEL_URL = '/models'
const DISTANCE_THRESHOLD = 0.48 // Balanced clustering threshold

let modelsLoaded = false

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return

  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
  ])

  modelsLoaded = true
}

// Compute Euclidean distance between two 128D descriptors
function euclideanDistance(desc1: Float32Array, desc2: number[]): number {
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

    const unscanned = await window.photoVault.getUnscannedPhotos()
    if (unscanned.length === 0) {
      updateProgress({ scannedCount: 0, totalCount: 0, isScanning: false })
      isScanning = false
      return
    }

    const totalCount = unscanned.length
    let scannedCount = 0

    updateProgress({ scannedCount, totalCount, isScanning: true })

    for (const photo of unscanned) {
      if (!isScanning) break // ability to cancel

      try {
        if (photo.is_document === 1) {
          await window.photoVault.markPhotoScanned(photo.id)
          scannedCount++
          updateProgress({ scannedCount, totalCount, isScanning: true })
          continue
        }

        // Load image from local file path via custom protocol wrapper
        const img = new Image()
        img.crossOrigin = 'anonymous'
        const url = getThumbnailUrl(photo.preview_path || photo.thumbnail_path, photo.file_path)
        
        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          img.src = url
        })

        // Scale down large images, but keep high enough resolution (2048) to spot smaller faces accurately
        const maxDim = 2048
        let scale = 1
        if (img.width > maxDim || img.height > maxDim) {
          scale = maxDim / Math.max(img.width, img.height)
        }
        const canvas = document.createElement('canvas')
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)

        // Detect all faces with balanced confidence (lowered to 0.6 to catch side/small faces in groups)
        const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 })
        const detections = await faceapi
          .detectAllFaces(canvas, options)
          .withFaceLandmarks()
          .withFaceDescriptors()

        if (detections.length > 0) {
          // Fetch existing descriptors for clustering
          const existingFaces = await window.photoVault.getAllFaceDescriptors()
          
          for (const detection of detections) {
            // Quality filter: skip tiny faces (lowered to 35px to catch faces in large group photos)
            if (detection.detection.box.width < 35 || detection.detection.box.height < 35) {
              continue;
            }

            const desc = detection.descriptor
            
            // Centroid-based closest match
            let bestMatch = { distance: 1.0, personId: -1 }
            
            // Group existing faces by person_id to calculate centroids
            const personClusters = new Map<number, Float32Array[]>()
            for (const face of existingFaces) {
              const knownDesc = new Float32Array(JSON.parse(face.descriptor))
              if (!personClusters.has(face.person_id)) personClusters.set(face.person_id, [])
              personClusters.get(face.person_id)!.push(knownDesc)
            }

            for (const [personId, descriptors] of personClusters.entries()) {
              // Compare against all descriptors of the person and take the minimum distance
              // This is standard practice in face recognition instead of strict centroids, 
              // but we enforce a tighter clustering match.
              let minDistance = 1.0;
              for (const knownDesc of descriptors) {
                 const dist = euclideanDistance(desc, Array.from(knownDesc))
                 if (dist < minDistance) minDistance = dist
              }
              
              if (minDistance < bestMatch.distance) {
                bestMatch = { distance: minDistance, personId }
              }
            }

            let assignedPersonId = bestMatch.personId
            if (bestMatch.distance < DISTANCE_THRESHOLD && assignedPersonId !== -1) {
              // Found a match
              await window.photoVault.saveFaceDescriptor(photo.id, assignedPersonId, Array.from(desc))
            } else {
              // Extract the face crop with a small margin
              const box = detection.detection.box
              const margin = Math.max(box.width, box.height) * 0.2
              const cropX = Math.max(0, box.x - margin)
              const cropY = Math.max(0, box.y - margin)
              const cropW = Math.min(canvas.width - cropX, box.width + margin * 2)
              const cropH = Math.min(canvas.height - cropY, box.height + margin * 2)
              
              const faceCanvas = document.createElement('canvas')
              faceCanvas.width = cropW
              faceCanvas.height = cropH
              const faceCtx = faceCanvas.getContext('2d')
              faceCtx?.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
              
              // Compress aggressively to keep sqlite small
              const faceBase64 = faceCanvas.toDataURL('image/jpeg', 0.7)

              // Create new person
              assignedPersonId = await window.photoVault.createPerson('Unknown Person', photo.id, faceBase64)
              await window.photoVault.saveFaceDescriptor(photo.id, assignedPersonId, Array.from(desc))
              // Update our local cache of faces to avoid querying DB for every detection
              existingFaces.push({ id: 0, photo_id: photo.id, person_id: assignedPersonId, descriptor: JSON.stringify(Array.from(desc)) })
            }
            
            if (onPersonFound) {
              onPersonFound()
            }
          }
        }
      } catch (err) {
        console.error(`Failed to scan photo ${photo.id}:`, err)
      } finally {
        await window.photoVault.markPhotoScanned(photo.id)
        scannedCount++
        updateProgress({ scannedCount, totalCount, isScanning: true })
      }
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
