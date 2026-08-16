import { IFingerprintCacheService, PhotoFingerprintRecord } from './types'
import { runSql, queryOne, queryAll } from '../../database'

export class FingerprintCacheService implements IFingerprintCacheService {
  async getFingerprint(photoId: number): Promise<PhotoFingerprintRecord | null> {
    const row = queryOne<any>(
      `SELECT p.id as photoId, p.file_path as filePath, p.file_size as fileSize, p.mime_type as mimeType,
              p.width, p.height, p.created_at as createdAt,
              fp.sha256, fp.partial_sha256 as partialSha256, fp.phash, fp.dhash, fp.ahash, fp.block_hash as blockHash,
              fp.rgb_histogram as rgbHistogramJson, fp.hsv_histogram as hsvHistogramJson, fp.edge_histogram as edgeHistogramJson,
              fp.quality_score as qualityScore, fp.video_duration as videoDuration, fp.video_keyframes as videoKeyframesJson,
              fp.algorithm_version as algorithmVersion, fp.clip_embedding as clipEmbedding, fp.embedding_version as embeddingVersion,
              fp.updated_at as updatedAt
       FROM photos p
       JOIN photo_fingerprints fp ON p.id = fp.photo_id
       WHERE p.id = ?`,
      [photoId]
    )

    if (!row) return null
    return this.mapRowToRecord(row)
  }

  async saveFingerprint(record: PhotoFingerprintRecord): Promise<void> {
    const rgbJson = record.rgbHistogram ? JSON.stringify(record.rgbHistogram) : null
    const hsvJson = record.hsvHistogram ? JSON.stringify(record.hsvHistogram) : null
    const edgeJson = record.edgeHistogram ? JSON.stringify(record.edgeHistogram) : null
    const keyframesJson = record.videoKeyframes ? JSON.stringify(record.videoKeyframes) : null

    runSql(
      `INSERT INTO photo_fingerprints (
        photo_id, sha256, partial_sha256, phash, dhash, ahash, block_hash,
        rgb_histogram, hsv_histogram, edge_histogram, quality_score,
        video_duration, video_keyframes, algorithm_version, clip_embedding, embedding_version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(photo_id) DO UPDATE SET
        sha256 = excluded.sha256,
        partial_sha256 = excluded.partial_sha256,
        phash = excluded.phash,
        dhash = excluded.dhash,
        ahash = excluded.ahash,
        block_hash = excluded.block_hash,
        rgb_histogram = excluded.rgb_histogram,
        hsv_histogram = excluded.hsv_histogram,
        edge_histogram = excluded.edge_histogram,
        quality_score = excluded.quality_score,
        video_duration = excluded.video_duration,
        video_keyframes = excluded.video_keyframes,
        algorithm_version = excluded.algorithm_version,
        clip_embedding = excluded.clip_embedding,
        embedding_version = excluded.embedding_version,
        updated_at = datetime('now')`,
      [
        record.photoId,
        record.sha256 || null,
        record.partialSha256 || null,
        record.phash || null,
        record.dhash || null,
        record.ahash || null,
        record.blockHash || null,
        rgbJson,
        hsvJson,
        edgeJson,
        record.qualityScore ?? 0,
        record.videoDuration ?? null,
        keyframesJson,
        record.algorithmVersion || 1,
        record.clipEmbedding || null,
        record.embeddingVersion || null
      ]
    )

    const legacyHash = record.dhash || (record.videoDuration ? `VID_DUR_${Math.round(record.videoDuration)}_${record.videoKeyframes?.[0] || ''}` : '')
    if (legacyHash) {
      runSql('UPDATE photos SET perceptual_hash = ? WHERE id = ?', [legacyHash, record.photoId])
    }
  }

  async getAllFingerprints(): Promise<PhotoFingerprintRecord[]> {
    const rows = queryAll<any>(`
      SELECT p.id as photoId, p.file_path as filePath, p.file_size as fileSize, p.mime_type as mimeType,
             p.width, p.height, p.created_at as createdAt, p.perceptual_hash as legacyHash,
             fp.sha256, fp.partial_sha256 as partialSha256, fp.phash, fp.dhash, fp.ahash, fp.block_hash as blockHash,
             fp.rgb_histogram as rgbHistogramJson, fp.hsv_histogram as hsvHistogramJson, fp.edge_histogram as edgeHistogramJson,
             fp.quality_score as qualityScore, fp.video_duration as videoDuration, fp.video_keyframes as videoKeyframesJson,
             fp.algorithm_version as algorithmVersion, fp.clip_embedding as clipEmbedding, fp.embedding_version as embeddingVersion,
             fp.updated_at as updatedAt
      FROM photos p
      LEFT JOIN photo_fingerprints fp ON p.id = fp.photo_id
      WHERE p.is_trashed = 0
    `)

    return rows.map((r) => this.mapRowToRecord(r))
  }

  private mapRowToRecord(r: any): PhotoFingerprintRecord {
    let rgbHistogram: number[] | undefined
    if (r.rgbHistogramJson) {
      try { rgbHistogram = JSON.parse(r.rgbHistogramJson) } catch {}
    }
    let hsvHistogram: number[] | undefined
    if (r.hsvHistogramJson) {
      try { hsvHistogram = JSON.parse(r.hsvHistogramJson) } catch {}
    }
    let edgeHistogram: number[] | undefined
    if (r.edgeHistogramJson) {
      try { edgeHistogram = JSON.parse(r.edgeHistogramJson) } catch {}
    }
    let videoKeyframes: string[] | undefined
    if (r.videoKeyframesJson) {
      try { videoKeyframes = JSON.parse(r.videoKeyframesJson) } catch {}
    }

    return {
      photoId: r.photoId,
      filePath: r.filePath,
      fileSize: r.fileSize || 0,
      mimeType: r.mimeType || 'image/jpeg',
      width: r.width || 0,
      height: r.height || 0,
      createdAt: r.createdAt || '',
      sha256: r.sha256 || undefined,
      partialSha256: r.partialSha256 || undefined,
      phash: r.phash || undefined,
      dhash: r.dhash || r.legacyHash || undefined,
      ahash: r.ahash || undefined,
      blockHash: r.blockHash || undefined,
      rgbHistogram,
      hsvHistogram,
      edgeHistogram,
      qualityScore: r.qualityScore || 0,
      videoDuration: r.videoDuration || undefined,
      videoKeyframes,
      algorithmVersion: r.algorithmVersion || 1,
      clipEmbedding: r.clipEmbedding || undefined,
      embeddingVersion: r.embeddingVersion || undefined,
      updatedAt: r.updatedAt || undefined
    }
  }
}

export const defaultFingerprintCacheService = new FingerprintCacheService()
