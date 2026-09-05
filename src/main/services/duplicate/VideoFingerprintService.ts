import { spawn } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import sharp from 'sharp'
import { existsSync } from 'fs'
import { IVideoFingerprintService, VideoFingerprint } from './types'
import { defaultPerceptualHashService } from './PerceptualHashService'

export class VideoFingerprintService implements IVideoFingerprintService {
  /**
   * Fast Video Fingerprint:
   * 1. If thumbnailPath exists, computes 256-bit dHash & 64-bit DCT pHash directly in ~3ms
   * 2. Probes video duration once via lightweight metadata probe
   */
  async computeVideoFingerprint(videoPath: string, thumbnailPath?: string | null): Promise<VideoFingerprint> {
    let dhash: string | undefined
    let phash: string | undefined
    const keyframes: string[] = []

    if (thumbnailPath && existsSync(thumbnailPath)) {
      try {
        const hashes = await defaultPerceptualHashService.computeMultiHashes(thumbnailPath)
        dhash = hashes.dhash
        phash = hashes.phash
        if (dhash) keyframes.push(dhash)
      } catch {}
    }

    const duration = await this.getVideoDuration(videoPath)

    return {
      duration,
      keyframes,
      dhash,
      phash
    }
  }

  /**
   * Compare two video temporal fingerprints across duration, thumbnail hashes, and keyframe vectors
   */
  compareVideoFingerprints(
    v1: VideoFingerprint,
    v2: VideoFingerprint
  ): { isDuplicate: boolean; confidence: number; reasons: string[] } {
    const durationDiff = Math.abs(v1.duration - v2.duration)
    if (durationDiff > 3.0) {
      return { isDuplicate: false, confidence: 0, reasons: ['Video duration differs significantly'] }
    }

    const reasons: string[] = []
    reasons.push(`Video durations match (${v1.duration.toFixed(1)}s vs ${v2.duration.toFixed(1)}s)`)

    // 1. Direct Thumbnail Perceptual Hash comparison (dHash & pHash)
    if (v1.dhash && v2.dhash && v1.dhash.length === 64 && v2.dhash.length === 64 && v1.dhash !== '0'.repeat(64)) {
      const dDist = defaultPerceptualHashService.hammingDistance(v1.dhash, v2.dhash)
      let pDist = 999
      if (v1.phash && v2.phash && v1.phash.length === 16 && v2.phash.length === 16) {
        pDist = defaultPerceptualHashService.hammingDistance(v1.phash, v2.phash)
      }

      if (dDist <= 14 || (dDist <= 22 && pDist <= 6)) {
        let confidence = 95
        if (dDist <= 6 && durationDiff <= 0.5) {
          confidence = 98
        } else if (dDist <= 10) {
          confidence = 95
        } else {
          confidence = 90
        }

        reasons.push(`Video Keyframe Visual Hash match (dHash dist: ${dDist}/256, pHash dist: ${pDist === 999 ? 'N/A' : pDist + '/64'})`)

        return {
          isDuplicate: true,
          confidence,
          reasons
        }
      }
    }

    // 2. Multi-keyframe vector fallback
    let matchedKeyframes = 0
    let totalDist = 0
    const count = Math.min(v1.keyframes.length, v2.keyframes.length)

    for (let i = 0; i < count; i++) {
      const k1 = v1.keyframes[i]
      const k2 = v2.keyframes[i]
      if (k1 && k2 && k1 !== '0'.repeat(64) && k2 !== '0'.repeat(64)) {
        const dist = defaultPerceptualHashService.hammingDistance(k1, k2)
        if (dist <= 30) {
          matchedKeyframes++
          totalDist += dist
        }
      }
    }

    if (matchedKeyframes >= 1 && count > 0) {
      const avgDist = totalDist / matchedKeyframes
      if (avgDist <= 22) {
        reasons.push(`${matchedKeyframes} keyframe vectors matched across timeline (avg dist: ${avgDist.toFixed(1)})`)
        return {
          isDuplicate: true,
          confidence: durationDiff <= 1.0 && avgDist <= 12 ? 95 : 90,
          reasons
        }
      }
    }

    return { isDuplicate: false, confidence: 0, reasons: ['Keyframe visual mismatch'] }
  }

  private getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve) => {
      const binPath = (ffmpegPath || 'ffmpeg').replace('app.asar', 'app.asar.unpacked')
      const probeProc = spawn(binPath, ['-i', videoPath], { windowsHide: true })
      let stderrData = ''

      probeProc.stderr.on('data', (chunk) => {
        stderrData += chunk.toString()
      })

      const timeout = setTimeout(() => {
        try { probeProc.kill() } catch {}
      }, 3500)

      probeProc.on('close', () => {
        clearTimeout(timeout)
        const match = stderrData.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
        if (match) {
          const hours = parseFloat(match[1])
          const mins = parseFloat(match[2])
          const secs = parseFloat(match[3])
          resolve(hours * 3600 + mins * 60 + secs)
        } else {
          resolve(0)
        }
      })
    })
  }

  private extractFrameHashAtTimestamp(videoPath: string, timestampSeconds: number): Promise<string> {
    return new Promise((resolve) => {
      const binPath = (ffmpegPath || 'ffmpeg').replace('app.asar', 'app.asar.unpacked')

      try {
        const frameProc = spawn(
          binPath,
          [
            '-ss', timestampSeconds.toFixed(2),
            '-i', videoPath,
            '-frames:v', '1',
            '-f', 'image2pipe',
            '-vcodec', 'png',
            '-'
          ],
          { windowsHide: true }
        )

        const chunks: Buffer[] = []
        frameProc.stdout.on('data', (chunk) => chunks.push(chunk))

        const timeout = setTimeout(() => {
          try { frameProc.kill() } catch {}
        }, 4000)

        frameProc.on('close', async () => {
          clearTimeout(timeout)
          const buffer = Buffer.concat(chunks)

          if (buffer.length > 0) {
            try {
              const { data } = await sharp(buffer, { failOn: 'none' })
                .resize(17, 16, { fit: 'fill' })
                .grayscale()
                .raw()
                .toBuffer({ resolveWithObject: true })

              if (data && data.length >= 272) {
                let binary = ''
                for (let row = 0; row < 16; row++) {
                  for (let col = 0; col < 16; col++) {
                    const left = data[row * 17 + col]
                    const right = data[row * 17 + col + 1]
                    binary += left < right ? '1' : '0'
                  }
                }
                let hex = ''
                for (let i = 0; i < 256; i += 4) {
                  hex += parseInt(binary.substring(i, i + 4), 2).toString(16)
                }
                resolve(hex)
                return
              }
            } catch {}
          }

          resolve('0'.repeat(64))
        })
      } catch {
        resolve('0'.repeat(64))
      }
    })
  }
}

export const defaultVideoFingerprintService = new VideoFingerprintService()
