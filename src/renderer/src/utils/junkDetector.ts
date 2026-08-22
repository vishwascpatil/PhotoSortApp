import { Photo } from '../contexts/PhotoContext'

export type JunkCategory = 'all' | 'high-confidence' | 'uncertain' | 'whatsapp' | 'stickers' | 'telegram' | 'facebook'

export interface JunkDetection {
  isJunk: boolean
  isUncertain: boolean
  classification: 'junk' | 'uncertain' | 'keep'
  score: number
  category: 'whatsapp' | 'telegram' | 'facebook' | 'instagram' | 'sticker' | 'other'
  reason: string
  matchedSignals: string[]
}

const KNOWN_PLATFORM_DIMS: readonly [number, number][] = [
  [1600, 1600], [1600, 900], [1280, 1280],
  [1080, 1080], [1080, 1350], [1080, 1920], [1080, 608],
  [1200, 630], [960, 960],
  [848, 480], [640, 480], [512, 512]
]

export function detectJunk(photo: Photo): JunkDetection {
  const filename = (photo.filename || '').trim()
  const filePath = (photo.file_path || '').replace(/\\/g, '/').toLowerCase()
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  let score = 0
  const matchedSignals: string[] = []
  let category: JunkDetection['category'] = 'other'

  // Signal 1: Filename Pattern (+35)
  if (/^IMG-\d{8}-WA\d{4}\./i.test(filename)) {
    score += 35
    matchedSignals.push('WhatsApp image naming pattern')
    category = 'whatsapp'
  } else if (/^VID-\d{8}-WA\d{4}\./i.test(filename)) {
    score += 35
    matchedSignals.push('WhatsApp video naming pattern')
    category = 'whatsapp'
  } else if (/^STK-\d{8}-WA\d{4}\./i.test(filename)) {
    score += 35
    matchedSignals.push('WhatsApp sticker naming pattern')
    category = 'sticker'
  } else if (/^photo_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\./i.test(filename)) {
    score += 35
    matchedSignals.push('Telegram photo naming pattern')
    category = 'telegram'
  } else if (/^video_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\./i.test(filename)) {
    score += 35
    matchedSignals.push('Telegram video naming pattern')
    category = 'telegram'
  } else if (/^received_\d+/i.test(filename) || /^FB_IMG_\d+/i.test(filename)) {
    score += 35
    matchedSignals.push('Facebook / Messenger download pattern')
    category = 'facebook'
  } else if (!/^(IMG_|DSC_|PXL_|DJI_|GOPR|SAM_|DCIM)/i.test(filename)) {
    if (/^[0-9a-f]{16,32}\./i.test(filename) || /^[0-9]{12,20}\./i.test(filename) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./i.test(filename)) {
      score += 20
      matchedSignals.push('Generated messaging hash filename')
    }
  }

  // Signal 2: Source Folder Path (+40)
  let folderMatched = false
  if (filePath.includes('whatsapp/media/whatsapp images') || filePath.includes('whatsapp images')) {
    score += 40
    matchedSignals.push('WhatsApp Images folder')
    category = 'whatsapp'
    folderMatched = true
  } else if (filePath.includes('whatsapp/media/whatsapp video') || filePath.includes('whatsapp video')) {
    score += 40
    matchedSignals.push('WhatsApp Video folder')
    category = 'whatsapp'
    folderMatched = true
  } else if (filePath.includes('whatsapp/media/whatsapp animated gifs') || filePath.includes('whatsapp animated gifs') || filePath.includes('whatsapp stickers')) {
    score += 40
    matchedSignals.push('WhatsApp GIFs/Stickers folder')
    category = 'sticker'
    folderMatched = true
  } else if (filePath.includes('telegram/telegram images') || filePath.includes('telegram images') || filePath.includes('telegram video') || filePath.includes('/telegram/')) {
    score += 40
    matchedSignals.push('Telegram media folder')
    category = 'telegram'
    folderMatched = true
  } else if (filePath.includes('/instagram/')) {
    score += 35
    matchedSignals.push('Instagram folder')
    category = 'instagram'
    folderMatched = true
  } else if (filePath.includes('/messenger/') || filePath.includes('/facebook/')) {
    score += 35
    matchedSignals.push('Facebook/Messenger folder')
    category = 'facebook'
    folderMatched = true
  } else if (filePath.includes('/downloads/whatsapp') || filePath.includes('/whatsapp/')) {
    score += 35
    matchedSignals.push('WhatsApp directory')
    category = 'whatsapp'
    folderMatched = true
  }

  // Signal 8: Sticker / WebP Short-Circuit (+40 / Instant Junk)
  if (ext === 'webp') {
    if ((photo.width && photo.height && Math.max(photo.width, photo.height) <= 800) || (photo.file_size && photo.file_size < 250 * 1024)) {
      score += 40
      matchedSignals.push('WebP sticker format')
      category = 'sticker'
    }
  }

  // Signal 5: Platform Resize Dimensions (+15)
  if (photo.width && photo.height) {
    const w = photo.width
    const h = photo.height
    for (const [kw, kh] of KNOWN_PLATFORM_DIMS) {
      if ((w === kw && h === kh) || (w === kh && h === kw)) {
        score += 15
        matchedSignals.push(`Platform resize dimensions (${w}×${h})`)
        break
      }
    }
  }

  // Signal 3: Aggressive re-compression
  if (photo.width && photo.height && photo.file_size) {
    const pixels = photo.width * photo.height
    const bytesPerPx = photo.file_size / pixels
    if (bytesPerPx < 0.22 && pixels > 200000) {
      score += 20
      matchedSignals.push('High re-compression ratio')
    }
  }

  // Signal 9: Camera EXIF presence (-50 Penalty)
  // (In PhotoRow, if camera_make or camera_model is known in exif)
  const hasCamera = (photo as any).make || (photo as any).model
  if (hasCamera) {
    score -= 50
    matchedSignals.push('Original camera EXIF detected (-50 penalty)')
  }

  // Instant Overrides:
  if (folderMatched && !hasCamera) {
    score = Math.max(score, 85)
  }
  if (ext === 'webp' && (photo.width || 0) <= 600) {
    score = Math.max(score, 90)
    category = 'sticker'
  }

  score = Math.max(0, Math.min(100, score))

  let classification: JunkDetection['classification'] = 'keep'
  if (score >= 70) {
    classification = 'junk'
  } else if (score >= 40) {
    classification = 'uncertain'
  }

  return {
    isJunk: classification === 'junk',
    isUncertain: classification === 'uncertain',
    classification,
    score,
    category,
    reason: matchedSignals.join(' • ') || 'No junk signals detected',
    matchedSignals
  }
}
