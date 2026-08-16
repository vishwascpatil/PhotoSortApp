import { Photo } from '../contexts/PhotoContext'

export const KNOWN_SCREENSHOT_RESOLUTIONS: readonly [number, number][] = [
  // phones
  [1080, 1920],
  [1080, 2340],
  [1080, 2400],
  [1170, 2532],
  [1179, 2556],
  [1284, 2778],
  [1290, 2796],
  // tablets
  [1620, 2160],
  [2048, 2732],
  // desktop/laptop
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
  [2560, 1600],
  [3024, 1964],
  [1440, 900],
  [1680, 1050],
  [1280, 720],
  [1280, 800],
  [1920, 1200],
  [3440, 1440]
] as const

export type ScreenshotCategory = 'all' | 'mobile' | 'desktop' | 'video'

export interface ScreenshotDetection {
  isScreenshot: boolean
  category: 'mobile' | 'desktop' | 'video'
  reason: string
}

export function detectScreenshot(photo: Photo): ScreenshotDetection {
  const filename = (photo.filename || '').trim()
  const lowerName = filename.toLowerCase()
  const filePath = (photo.file_path || '').replace(/\\/g, '/').toLowerCase()

  // 1. Check video screen recordings
  const isVideo =
    lowerName.endsWith('.mp4') ||
    lowerName.endsWith('.mov') ||
    lowerName.endsWith('.mkv') ||
    lowerName.endsWith('.webm') ||
    lowerName.endsWith('.avi')

  if (isVideo) {
    if (
      lowerName.includes('screen_recording') ||
      lowerName.includes('screen recording') ||
      lowerName.includes('screen-recording') ||
      lowerName.includes('screenrecording') ||
      lowerName.includes('screencap') ||
      lowerName.includes('screencast') ||
      filePath.includes('/captures/') ||
      filePath.includes('/screen recording/') ||
      filePath.includes('/screen recordings/')
    ) {
      return { isScreenshot: true, category: 'video', reason: 'Screen recording video' }
    }
  }

  // 2. High-precision filename patterns
  // Windows: "Screenshot 2026-08-16 193021.png" or "Screenshot_2026..."
  if (/^screenshot[ _-]\d{4}-\d{2}-\d{2}[ _-]\d{6}/i.test(filename)) {
    return { isScreenshot: true, category: 'desktop', reason: 'Filename matches Windows screenshot pattern' }
  }
  // Android: "Screenshot_20260816-193021.png" or "Screenshot_20260816_193021.png"
  if (/^screenshot_\d{8}[-_]\d{6}/i.test(filename)) {
    return { isScreenshot: true, category: 'mobile', reason: 'Filename matches Android screenshot pattern' }
  }
  // macOS: "Screen Shot 2026-08-16 at 7.30.21 PM.png" or "Screenshot 2026-08-16 at..."
  if (/^screen ?shot \d{4}-\d{2}-\d{2}/i.test(filename)) {
    return { isScreenshot: true, category: 'desktop', reason: 'Filename matches macOS screenshot pattern' }
  }

  // 3. Keyword matches in filename
  if (
    lowerName.includes('screenshot') ||
    lowerName.includes('screen shot') ||
    lowerName.includes('screen_shot') ||
    lowerName.includes('screen-shot') ||
    lowerName.includes('screencap') ||
    lowerName.includes('screengrab') ||
    lowerName.includes('snip') ||
    lowerName.includes('printscreen') ||
    lowerName.includes('prtscn')
  ) {
    const isMobileKeyword = lowerName.includes('android') || lowerName.includes('ios') || lowerName.includes('phone')
    return {
      isScreenshot: true,
      category: isMobileKeyword ? 'mobile' : 'desktop',
      reason: 'Filename contains screenshot keywords'
    }
  }

  // 4. Folder path matches
  if (
    filePath.includes('/screenshots/') ||
    filePath.includes('/screen captures/') ||
    filePath.includes('/captures/') ||
    filePath.includes('/snippingtool/') ||
    filePath.includes('/screencapture/')
  ) {
    return { isScreenshot: true, category: 'desktop', reason: 'File located in screenshots folder' }
  }

  // 5. Resolution checks (exact known resolution matches)
  if (photo.width && photo.height) {
    const w = photo.width
    const h = photo.height

    const isKnown = KNOWN_SCREENSHOT_RESOLUTIONS.some(([rw, rh]) =>
      (w === rw && h === rh) || (w === rh && h === rw)
    )

    if (isKnown) {
      const isMobileRes =
        (w === 1080 && (h === 1920 || h === 2340 || h === 2400)) ||
        (w === 1170 && h === 2532) ||
        (w === 1179 && h === 2556) ||
        (w === 1284 && h === 2778) ||
        (w === 1290 && h === 2796) ||
        (h === 1080 && (w === 1920 || w === 2340 || w === 2400)) ||
        (h === 1170 && w === 2532) ||
        (h === 1179 && w === 2556) ||
        (h === 1284 && w === 2778) ||
        (h === 1290 && w === 2796)

      if (lowerName.endsWith('.png') || lowerName.endsWith('.webp')) {
        return {
          isScreenshot: true,
          category: isMobileRes ? 'mobile' : 'desktop',
          reason: 'Standard display resolution match'
        }
      }
    }

    // 6. Mobile aspect ratio heuristics (tall phone display ratio >= 1.7)
    const aspectRatio = h > w ? h / w : w / h
    if (lowerName.endsWith('.png') && aspectRatio >= 1.7) {
      return { isScreenshot: true, category: 'mobile', reason: 'Mobile screen aspect ratio' }
    }
  }

  return { isScreenshot: false, category: 'desktop', reason: '' }
}

export function isScreenshot(photo: Photo): boolean {
  return detectScreenshot(photo).isScreenshot
}
