/**
 * Enterprise-Grade Duplicate Detection Engine Core Types & Interfaces
 */

export interface PhotoFingerprintRecord {
  photoId: number
  filePath: string
  fileSize: number
  mimeType: string
  width: number
  height: number
  createdAt: string
  thumbnailPath?: string | null
  sha256?: string
  partialSha256?: string
  phash?: string
  dhash?: string
  ahash?: string
  blockHash?: string
  rgbHistogram?: number[]
  hsvHistogram?: number[]
  edgeHistogram?: number[]
  qualityScore?: number
  videoDuration?: number
  videoKeyframes?: string[] // Adaptive array of temporal keyframe dHashes
  algorithmVersion?: number
  clipEmbedding?: Buffer
  embeddingVersion?: string
  updatedAt?: string
}

export type ConfidenceLevel =
  | '100% Exact Duplicate'
  | '99% Binary Match'
  | '95% Visually Identical'
  | '90% Same Image Different Compression'
  | '85% Same Image Different Resolution'
  | '80% Slightly Edited'
  | '75% Probably Duplicate'

export interface DuplicatePair {
  photo1Id: number
  photo2Id: number
  confidence: number // 75 to 100
  confidenceLabel: ConfidenceLevel
  matchReasons: string[]
  isExact: boolean
  isVideo: boolean
}

export interface DuplicateGroupResult {
  id: string
  confidence: number
  confidenceLabel: ConfidenceLevel
  isExact: boolean
  isVideo: boolean
  masterPhotoId: number
  totalBytes: number
  recoverableBytes: number
  items: PhotoFingerprintRecord[]
}

export interface ScanStats {
  filesScanned: number
  imagesScanned: number
  videosScanned: number
  hashesGenerated: number
  candidatePairsGenerated: number
  comparisonsExecuted: number
  duplicateGroupsFound: number
  recoverableStorage: number
  filesPerSecond: number
  estimatedRemainingSeconds: number
  isScanning: boolean
}

export interface ScanCheckpoint {
  lastProcessedPhotoId: number
  stage: string
  percentage: number
  updatedAt: string
}

export interface IHashService {
  computeSha256(filePath: string): Promise<string>
  computePartialSha256(filePath: string, headBytes?: number): Promise<string>
}

export interface PerceptualHashes {
  phash: string
  dhash: string
  ahash: string
  blockHash: string
  rotations?: {
    rot90: string
    rot180: string
    rot270: string
    flipH: string
    flipV: string
  }
}

export interface IPerceptualHashService {
  computeMultiHashes(imagePath: string, thumbnailPath?: string | null): Promise<PerceptualHashes>
  computeRotationVariants(imagePath: string): Promise<PerceptualHashes['rotations']>
  hammingDistance(h1: string, h2: string): number
}

export interface VideoFingerprint {
  duration: number
  keyframes: string[]
  dhash?: string
  phash?: string
}

export interface IVideoFingerprintService {
  computeVideoFingerprint(videoPath: string, thumbnailPath?: string | null): Promise<VideoFingerprint>
  compareVideoFingerprints(v1: VideoFingerprint, v2: VideoFingerprint): { isDuplicate: boolean; confidence: number; reasons: string[] }
}

export interface IFeatureVectorService {
  computeRgbHistogram(imagePath: string): Promise<number[]>
  computeHsvHistogram(imagePath: string): Promise<number[]>
  computeEdgeHistogram(imagePath: string): Promise<number[]>
  compareHistograms(h1: number[], h2: number[]): number
  computeSSIMScore(path1: string, path2: string): Promise<number>
}

export interface ICandidateGenerationService {
  generateCandidatePairs(records: PhotoFingerprintRecord[]): Map<string, Set<number>>
}

export interface IDuplicateDetectionService {
  evaluatePair(r1: PhotoFingerprintRecord, r2: PhotoFingerprintRecord): Promise<DuplicatePair | null>
}

export interface IDuplicateGroupingService {
  clusterPairs(records: PhotoFingerprintRecord[], pairs: DuplicatePair[]): DuplicateGroupResult[]
}

export interface IQualityScoreService {
  calculateQualityScore(record: PhotoFingerprintRecord, blurScore?: number): Promise<number>
  selectBestMaster(records: PhotoFingerprintRecord[]): PhotoFingerprintRecord
}

export interface IFingerprintCacheService {
  getFingerprint(photoId: number): Promise<PhotoFingerprintRecord | null>
  saveFingerprint(record: PhotoFingerprintRecord): Promise<void>
  getAllFingerprints(): Promise<PhotoFingerprintRecord[]>
}

export interface IScanProgressService {
  getStats(): ScanStats
  saveCheckpoint(checkpoint: ScanCheckpoint): Promise<void>
  getCheckpoint(): Promise<ScanCheckpoint | null>
}
