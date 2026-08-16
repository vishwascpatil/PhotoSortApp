import { IScanProgressService, ScanStats, ScanCheckpoint } from './types'
import { runSql, queryOne } from '../../database'

export class ScanProgressService implements IScanProgressService {
  private startTime: number = Date.now()
  private stats: ScanStats = {
    filesScanned: 0,
    imagesScanned: 0,
    videosScanned: 0,
    hashesGenerated: 0,
    candidatePairsGenerated: 0,
    comparisonsExecuted: 0,
    duplicateGroupsFound: 0,
    recoverableStorage: 0,
    filesPerSecond: 0,
    estimatedRemainingSeconds: 0,
    isScanning: false
  }

  startScan(totalFiles: number): void {
    this.startTime = Date.now()
    this.stats = {
      filesScanned: 0,
      imagesScanned: 0,
      videosScanned: 0,
      hashesGenerated: 0,
      candidatePairsGenerated: 0,
      comparisonsExecuted: 0,
      duplicateGroupsFound: 0,
      recoverableStorage: 0,
      filesPerSecond: 0,
      estimatedRemainingSeconds: 0,
      isScanning: true
    }
  }

  updateProgress(scanned: number, total: number, isVideo: boolean = false): void {
    this.stats.filesScanned = scanned
    if (isVideo) this.stats.videosScanned++
    else this.stats.imagesScanned++
    this.stats.hashesGenerated++

    const elapsedSecs = Math.max(0.1, (Date.now() - this.startTime) / 1000)
    this.stats.filesPerSecond = Math.round((scanned / elapsedSecs) * 10) / 10

    const remaining = total - scanned
    if (this.stats.filesPerSecond > 0 && remaining > 0) {
      this.stats.estimatedRemainingSeconds = Math.round(remaining / this.stats.filesPerSecond)
    } else {
      this.stats.estimatedRemainingSeconds = 0
    }
  }

  finishScan(duplicateGroups: number, recoverableBytes: number): void {
    this.stats.duplicateGroupsFound = duplicateGroups
    this.stats.recoverableStorage = recoverableBytes
    this.stats.isScanning = false
    this.stats.estimatedRemainingSeconds = 0
  }

  getStats(): ScanStats {
    return { ...this.stats }
  }

  async saveCheckpoint(checkpoint: ScanCheckpoint): Promise<void> {
    runSql(
      `INSERT INTO scan_checkpoints (id, last_processed_photo_id, stage, percentage, updated_at)
       VALUES (1, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         last_processed_photo_id = excluded.last_processed_photo_id,
         stage = excluded.stage,
         percentage = excluded.percentage,
         updated_at = datetime('now')`,
      [checkpoint.lastProcessedPhotoId, checkpoint.stage, checkpoint.percentage]
    )
  }

  async getCheckpoint(): Promise<ScanCheckpoint | null> {
    const row = queryOne<any>('SELECT * FROM scan_checkpoints WHERE id = 1')
    if (!row) return null
    return {
      lastProcessedPhotoId: row.last_processed_photo_id,
      stage: row.stage,
      percentage: row.percentage,
      updatedAt: row.updated_at
    }
  }
}

export const defaultScanProgressService = new ScanProgressService()
