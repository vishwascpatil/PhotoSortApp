import {
  IDuplicateGroupingService,
  PhotoFingerprintRecord,
  DuplicatePair,
  DuplicateGroupResult,
  ConfidenceLevel
} from './types'
import { defaultQualityScoreService } from './QualityScoreService'

class DisjointSet {
  private parent = new Map<number, number>()

  find(i: number): number {
    if (!this.parent.has(i)) this.parent.set(i, i)
    if (this.parent.get(i) === i) return i
    const root = this.find(this.parent.get(i)!)
    this.parent.set(i, root)
    return root
  }

  union(i: number, j: number): void {
    const rootI = this.find(i)
    const rootJ = this.find(j)
    if (rootI !== rootJ) {
      this.parent.set(rootI, rootJ)
    }
  }
}

export class DuplicateGroupingService implements IDuplicateGroupingService {
  clusterPairs(
    records: PhotoFingerprintRecord[],
    pairs: DuplicatePair[]
  ): DuplicateGroupResult[] {
    if (pairs.length === 0) return []

    const recordMap = new Map<number, PhotoFingerprintRecord>()
    records.forEach((r) => recordMap.set(r.photoId, r))

    const dsu = new DisjointSet()
    const pairConfidenceMap = new Map<string, DuplicatePair>()

    pairs.forEach((p) => {
      dsu.union(p.photo1Id, p.photo2Id)
      const pairKey = `${Math.min(p.photo1Id, p.photo2Id)}_${Math.max(p.photo1Id, p.photo2Id)}`
      pairConfidenceMap.set(pairKey, p)
    })

    // Group record IDs by root parent
    const clustersMap = new Map<number, number[]>()
    pairs.forEach((p) => {
      [p.photo1Id, p.photo2Id].forEach((id) => {
        const root = dsu.find(id)
        if (!clustersMap.has(root)) clustersMap.set(root, [])
        if (!clustersMap.get(root)!.includes(id)) {
          clustersMap.get(root)!.push(id)
        }
      })
    })

    const results: DuplicateGroupResult[] = []
    let groupCounter = 1

    clustersMap.forEach((photoIds, rootId) => {
      if (photoIds.length < 2) return

      const clusterRecords = photoIds
        .map((id) => recordMap.get(id))
        .filter((r): r is PhotoFingerprintRecord => r !== undefined)

      if (clusterRecords.length < 2) return

      // Select Master copy using enterprise QualityScoreService
      const master = defaultQualityScoreService.selectBestMaster(clusterRecords)
      const duplicateCopies = clusterRecords.filter((r) => r.photoId !== master.photoId)
      const sortedCluster = [master, ...duplicateCopies]

      const totalBytes = clusterRecords.reduce((sum, r) => sum + (r.fileSize || 0), 0)
      const recoverableBytes = duplicateCopies.reduce((sum, r) => sum + (r.fileSize || 0), 0)
      const isVideo = clusterRecords.some((r) =>
        r.mimeType?.startsWith('video') ||
        ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.m4v', '.webm'].some((ext) =>
          r.filePath.toLowerCase().endsWith(ext)
        )
      )

      // Find average confidence score in this cluster
      let maxConfidence = 75
      let isExactGroup = true
      let bestConfidenceLabel: ConfidenceLevel = '75% Probably Duplicate'

      for (let i = 0; i < clusterRecords.length; i++) {
        for (let j = i + 1; j < clusterRecords.length; j++) {
          const key = `${Math.min(clusterRecords[i].photoId, clusterRecords[j].photoId)}_${Math.max(clusterRecords[i].photoId, clusterRecords[j].photoId)}`
          const pair = pairConfidenceMap.get(key)
          if (pair) {
            if (pair.confidence > maxConfidence) {
              maxConfidence = pair.confidence
              bestConfidenceLabel = pair.confidenceLabel
            }
            if (!pair.isExact) isExactGroup = false
          }
        }
      }

      results.push({
        id: `dup_group_${groupCounter++}`,
        confidence: maxConfidence,
        confidenceLabel: bestConfidenceLabel,
        isExact: isExactGroup,
        isVideo,
        masterPhotoId: master.photoId,
        totalBytes,
        recoverableBytes,
        items: clusterRecords
      })
    })

    // Sort duplicate groups by highest recoverable bytes first
    results.sort((a, b) => b.recoverableBytes - a.recoverableBytes)

    return results
  }

  /**
   * Compare photo quality to select the Master copy:
   * Higher resolution > Lossless format > Larger file size > Original filename
   */
  private comparePhotoQuality(a: PhotoFingerprintRecord, b: PhotoFingerprintRecord): number {
    const resA = (a.width || 0) * (a.height || 0)
    const resB = (b.width || 0) * (b.height || 0)

    if (resA !== resB) return resA - resB

    const isLossless = (mime: string) => mime.includes('png') || mime.includes('raw') || mime.includes('tiff')
    const losslessA = isLossless(a.mimeType || '') ? 1 : 0
    const losslessB = isLossless(b.mimeType || '') ? 1 : 0
    if (losslessA !== losslessB) return losslessA - losslessB

    const isCopyName = (pathStr: string) => /-\s*copy|\(\d+\)/i.test(pathStr)
    const copyA = isCopyName(a.filePath) ? 0 : 1
    const copyB = isCopyName(b.filePath) ? 0 : 1
    if (copyA !== copyB) return copyA - copyB

    return (a.fileSize || 0) - (b.fileSize || 0)
  }
}

export const defaultDuplicateGroupingService = new DuplicateGroupingService()
