import { spawn } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import sharp from 'sharp'
import { IVideoFingerprintService, VideoFingerprint } from './types'
import { defaultPerceptualHashService } from './PerceptualHashService'

export class VideoFingerprintService implements IVideoFingerprintService {
  /**
   * Extract video duration and 5 temporal keyframe dHashes (10%, 30%, 50%, 70%, 90%)
   */
  async computeVideoFingerprint(videoPath: string): Promise<VideoFingerprint> {
    const duration = await this.getVideoDuration(videoPath)

    // Adaptive keyframe count: <15s -> 5 keyframes, 30s -> 8 keyframes, 60s -> 12 keyframes, >60s -> 15 keyframes
    let keyframePcts: number[] = [0.1, 0.3, 0.5, 0.7, 0.9]
    if (duration > 60) {
      keyframePcts = Array.from({ length: 15 }, (_, i) => (i + 1) / 16)
    } else if (duration > 30) {
      keyframePcts = Array.from({ length: 12 }, (_, i) => (i + 1) / 13)
    } else if (duration >= 15) {
      keyframePcts = Array.from({ length: 8 }, (_, i) => (i + 1) / 9)
    }

    const timestamps = keyframePcts.map((pct) =>
      Math.max(0.5, duration > 0 ? duration * pct : 1.0 + pct * 2)
    )

    const keyframes = await Promise.all(
      timestamps.map((t) => this.extractFrameHashAtTimestamp(videoPath, t))
    )

    return {
      duration,
      keyframes
    }
  }

  /**
   * Compare two video temporal fingerprints across 5 keyframe vectors and duration
   */
  compareVideoFingerprints(
    v1: VideoFingerprint,
    v2: VideoFingerprint
  ): { isDuplicate: boolean; confidence: number; reasons: string[] } {
    const durationDiff = Math.abs(v1.duration - v2.duration)
    if (durationDiff > 3.5) {
      return { isDuplicate: false, confidence: 0, reasons: ['Video duration differs significantly'] }
    }

    const reasons: string[] = []
    reasons.push(`Video durations match (${v1.duration.toFixed(1)}s vs ${v2.duration.toFixed(1)}s)`)

    let matchedKeyframes = 0
    let totalDist = 0
    const count = Math.min(v1.keyframes.length, v2.keyframes.length)

    for (let i = 0; i < count; i++) {
      const k1 = v1.keyframes[i]
      const k2 = v2.keyframes[i]
      if (k1 && k2 && k1 !== '0'.repeat(64) && k2 !== '0'.repeat(64)) {
        const dist = defaultPerceptualHashService.hammingDistance(k1, k2)
        if (dist <= 38) {
          matchedKeyframes++
          totalDist += dist
        }
      }
    }

    if (matchedKeyframes >= 2) {
      const avgDist = totalDist / Math.max(1, matchedKeyframes)
      let confidence = 95
      if (durationDiff <= 1.0 && matchedKeyframes >= 4 && avgDist <= 20) {
        confidence = 98
      } else if (matchedKeyframes >= 3) {
        confidence = 90
      } else {
        confidence = 85
      }

      reasons.push(`${matchedKeyframes}/5 temporal keyframe vectors matched across video timeline`)

      return {
        isDuplicate: true,
        confidence,
        reasons
      }
    }

    return { isDuplicate: false, confidence: 0, reasons: ['Keyframe temporal vector mismatch'] }
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
