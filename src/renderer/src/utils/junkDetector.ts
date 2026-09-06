import { Photo } from '../contexts/PhotoContext'
import { isScreenshot } from './screenshotDetector'

export type SocialAppCategory =
  | 'all'
  | 'whatsapp'
  | 'instagram'
  | 'snapchat'
  | 'linkedin'
  | 'browser'
  | 'editor'
  | 'other-social'
  | 'other-apps'

// Backward compatibility alias
export type JunkCategory = SocialAppCategory

export interface SocialAppOrigin {
  category: SocialAppCategory
  label: string
  color: string
  gradient: string
  isAppMedia: boolean
  isUncertain: boolean
  classification: 'app-media' | 'uncertain' | 'keep'
  score: number
  reason: string
  matchedSignals: string[]
}

// Backward compatibility alias
export type JunkDetection = SocialAppOrigin

export const APP_THEMES: Record<SocialAppCategory, { label: string; color: string; gradient: string }> = {
  all: {
    label: 'All Apps',
    color: '#3b82f6',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
  },
  whatsapp: {
    label: 'WhatsApp',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
  },
  instagram: {
    label: 'Instagram',
    color: '#ec4899',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)'
  },
  snapchat: {
    label: 'Snapchat',
    color: '#eab308',
    gradient: 'linear-gradient(135deg, #facc15 0%, #ca8a04 100%)'
  },
  linkedin: {
    label: 'LinkedIn',
    color: '#0284c7',
    gradient: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
  },
  browser: {
    label: 'Web Download',
    color: '#06b6d4',
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)'
  },
  editor: {
    label: 'Editor App',
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)'
  },
  'other-social': {
    label: 'Other Social',
    color: '#6366f1',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
  },
  'other-apps': {
    label: 'Unidentified App',
    color: '#64748b',
    gradient: 'linear-gradient(135deg, #64748b 0%, #475569 100%)'
  }
}

const KNOWN_PLATFORM_DIMS: readonly [number, number][] = [
  // WhatsApp caps
  [1600, 1600],
  [1600, 900],
  [1280, 1280],
  [720, 1600],
  [720, 1280],
  // Instagram feed / story / reels
  [1080, 1080],
  [1080, 1350],
  [1080, 1920],
  [1080, 608],
  // Facebook / Messenger
  [1200, 630],
  [960, 960],
  // Standard low-res forward caps
  [848, 480],
  [640, 480],
  [512, 512]
] as const

export function detectJunk(photo: Photo): SocialAppOrigin {
  const filename = (photo.filename || '').trim()
  const filePath = (photo.file_path || '').replace(/\\/g, '/').toLowerCase()
  const lowerName = filename.toLowerCase()
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  let score = 0
  const matchedSignals: string[] = []
  let category: SocialAppCategory = 'other-apps'
  let identifiedApp = false

  // ─── Screenshot Safeguard ────────────────────────────────────────────────
  // Phone/System screenshots belong to the dedicated Screenshots section,
  // NOT Social Media & Apps / Web Downloads.
  if (isScreenshot(photo)) {
    return {
      isAppMedia: false,
      isJunk: false,
      isUncertain: false,
      classification: 'keep',
      score: 0,
      category: 'other-apps',
      label: 'Screenshot',
      color: '#64748b',
      gradient: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
      reason: 'Phone screenshot detected (managed under Screenshots section)',
      matchedSignals: ['Phone screenshot']
    }
  }

  // Determine if genuine camera hardware EXIF exists
  const cameraMake = photo.camera_make || (photo as any).make || ''
  const cameraModel = photo.camera_model || (photo as any).model || ''
  const hasHardwareCamera = Boolean(cameraMake.trim() || cameraModel.trim())

  // Apple native camera roll naming safeguard (IMG_xxxx / IMG_Exxxx)
  const isNativeAppleCameraFilename = /^IMG_E?\d{4}\.(heic|dng|jpg|jpeg|mov|mp4|png)$/i.test(filename)
  const isRawFormat = ext === 'dng' || ext === 'raw' || ext === 'cr2' || ext === 'nef' || ext === 'arw'

  // ─── 1. WhatsApp ─────────────────────────────────────────────────────────
  if (/^IMG-\d{8}-WA\d{4,}\./i.test(filename)) {
    score += 60
    matchedSignals.push('WhatsApp image (IMG-YYYYMMDD-WA...)')
    category = 'whatsapp'
    identifiedApp = true
  } else if (/^VID-\d{8}-WA\d{4,}\./i.test(filename)) {
    score += 60
    matchedSignals.push('WhatsApp video (VID-YYYYMMDD-WA...)')
    category = 'whatsapp'
    identifiedApp = true
  } else if (/^STK-\d{8}-WA\d{4,}\./i.test(filename)) {
    score += 60
    matchedSignals.push('WhatsApp sticker (STK-YYYYMMDD-WA...)')
    category = 'whatsapp'
    identifiedApp = true
  } else if (/WhatsApp (Image|Video|Audio|Document) \d{4}-\d{2}-\d{2}/i.test(filename)) {
    score += 55
    matchedSignals.push('WhatsApp Web / Desktop exported file')
    category = 'whatsapp'
    identifiedApp = true
  } else if (/^WA[-_]?\d+/i.test(filename)) {
    score += 50
    matchedSignals.push('WhatsApp exported media prefix')
    category = 'whatsapp'
    identifiedApp = true
  } else if (/^[A-Z]{4,7}\d{4,5}\.(jpg|jpeg|mov|mp4|png|webp)$/i.test(filename) && !hasHardwareCamera) {
    // iOS saved WhatsApp forward pattern (e.g. AAWT0024.JPG, HCYXE5581.MOV)
    score += 50
    matchedSignals.push('iOS WhatsApp forward naming (4-letter code)')
    category = 'whatsapp'
    identifiedApp = true
  } else if (
    filePath.includes('/whatsapp/') ||
    filePath.includes('whatsapp images') ||
    filePath.includes('whatsapp video') ||
    filePath.includes('whatsapp stickers')
  ) {
    score += 50
    matchedSignals.push('Located in WhatsApp directory')
    category = 'whatsapp'
    identifiedApp = true
  }

  // ─── 2. Instagram ─────────────────────────────────────────────────────────
  if (!identifiedApp) {
    if (/^\d{6,15}_\d{10,25}_\d{10,25}_[no]\.(jpg|mp4|webp)$/i.test(filename)) {
      score += 55
      matchedSignals.push('Instagram CDN hashed file naming pattern')
      category = 'instagram'
      identifiedApp = true
    } else if (/^(instagram|ig|reels)[-_]/i.test(filename) || filePath.includes('/instagram/') || filePath.includes('/ig/')) {
      score += 50
      matchedSignals.push('Instagram download source')
      category = 'instagram'
      identifiedApp = true
    }
  }

  // ─── 3. Snapchat ─────────────────────────────────────────────────────────
  if (!identifiedApp) {
    if (/^snapchat[-_]\d+/i.test(filename) || /^snap[-_]\d+/i.test(filename) || filePath.includes('/snapchat/')) {
      score += 50
      matchedSignals.push('Snapchat exported media')
      category = 'snapchat'
      identifiedApp = true
    }
  }

  // ─── 4. LinkedIn ─────────────────────────────────────────────────────────
  if (!identifiedApp) {
    if (
      /^linkedin-feed-image-/i.test(filename) ||
      /^feedshare-shrink_/i.test(filename) ||
      /^li_feed_/i.test(filename) ||
      /^linkedin_/i.test(filename) ||
      /\blinkedin\b/i.test(lowerName) ||
      filePath.includes('/linkedin/')
    ) {
      score += 50
      matchedSignals.push('LinkedIn feed share download')
      category = 'linkedin'
      identifiedApp = true
    }
  }

  // ─── 5. Editor & Creative Apps (Canva, Snapseed, VSCO, Photoshop, etc.) ──
  if (!identifiedApp) {
    const isCanva = /canva\s*-\s*|untitled\s*design|^canva_/i.test(lowerName)
    const isSnapseed = /^snapseed/i.test(lowerName) || filePath.includes('/snapseed/')
    const isVsco = /^vsco[-_]?\d*/i.test(lowerName) || filePath.includes('/vsco/')
    const isInshot = /^inshot[-_]?\d*/i.test(lowerName) || filePath.includes('/inshot/')
    const isCapcut = /^capcut[-_]?\d*/i.test(lowerName) || filePath.includes('/capcut/')
    const isPicsart = /^picsart/i.test(lowerName) || filePath.includes('/picsart/')
    const isAdobe = /_edit\b|_edited\b|_psd\b|_export\b|_render\b|adobe|photoshop|lightroom/i.test(lowerName)

    if (isCanva || isSnapseed || isVsco || isInshot || isCapcut || isPicsart || isAdobe) {
      score += 45
      const appName = isCanva
        ? 'Canva'
        : isSnapseed
        ? 'Snapseed'
        : isVsco
        ? 'VSCO'
        : isInshot
        ? 'InShot'
        : isCapcut
        ? 'CapCut'
        : isPicsart
        ? 'PicsArt'
        : 'Photo Editor'
      matchedSignals.push(`Created with ${appName}`)
      category = 'editor'
      identifiedApp = true
    }
  }

  // ─── 6. Browser & Web Downloads ──────────────────────────────────────────
  if (!identifiedApp) {
    const isBrowserDownloadName =
      /^download(\s*\(\d+\))?\.(jpg|jpeg|png|webp|gif|mp4|mov)$/i.test(filename) ||
      /^image(\s*\(\d+\))?\.(jpg|jpeg|png|webp)$/i.test(filename) ||
      /^photo(\s*\(\d+\))?\.(jpg|jpeg|png)$/i.test(filename) ||
      /^untitled(\s*\(\d+\))?\.(jpg|jpeg|png|webp)$/i.test(filename) ||
      /^save_image/i.test(filename) ||
      /^(chrome|safari|firefox|edge)[-_]/i.test(filename)

    const isWebAssetKeyword =
      /favicon|logo|banner|header|button|badge|clipart|vector|stockphoto|infographic|artboard/i.test(lowerName)

    // Only flag as download directory if the file is directly inside a browser/download directory,
    // NOT inside user backups or sub-albums like "17 pro max-backup"
    const isDirectDownloadDir =
      /\/downloads\/[^/]+\.[a-z0-9]+$/i.test(filePath) ||
      /\/browser\/[^/]+\.[a-z0-9]+$/i.test(filePath) ||
      /\/chrome\/downloads/i.test(filePath) ||
      /\/safari\/downloads/i.test(filePath)

    if (isBrowserDownloadName || isWebAssetKeyword || (isDirectDownloadDir && !hasHardwareCamera)) {
      score += 45
      matchedSignals.push('Web browser download / online asset')
      category = 'browser'
      identifiedApp = true
    }
  }

  // ─── 7. Other Social Media (Telegram, Facebook, Reddit, Twitter, TikTok) ─
  if (!identifiedApp) {
    if (/^photo_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\./i.test(filename) || filePath.includes('/telegram/')) {
      score += 50
      matchedSignals.push('Telegram photo download')
      category = 'other-social'
      identifiedApp = true
    } else if (/^received_\d+/i.test(filename) || /^fb_img_\d+/i.test(filename) || filePath.includes('/facebook/') || filePath.includes('/messenger/')) {
      score += 50
      matchedSignals.push('Facebook / Messenger media')
      category = 'other-social'
      identifiedApp = true
    } else if (/^rdt_\d+/i.test(filename) || filePath.includes('/reddit/')) {
      score += 50
      matchedSignals.push('Reddit download')
      category = 'other-social'
      identifiedApp = true
    } else if (/^(twitter|tw|x_export)[-_]/i.test(filename) || filePath.includes('/twitter/')) {
      score += 50
      matchedSignals.push('Twitter / X download')
      category = 'other-social'
      identifiedApp = true
    } else if (/^(tiktok|snaptik|ssstik)/i.test(filename) || filePath.includes('/tiktok/')) {
      score += 50
      matchedSignals.push('TikTok exported video')
      category = 'other-social'
      identifiedApp = true
    }
  }

  // ─── 8. Generic CDN Hashes & Unidentified App Forwards ───────────────────
  if (!identifiedApp && !hasHardwareCamera && !isNativeAppleCameraFilename) {
    if (
      /^[0-9a-f]{20,32}\.(jpg|png|webp|gif)/i.test(filename) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./i.test(filename)
    ) {
      score += 35
      matchedSignals.push('Hashed CDN asset filename')
      category = 'other-apps'
      identifiedApp = true
    }
  }

  // Extreme aspect ratio or micro web dimensions without camera EXIF
  if (photo.width && photo.height && !hasHardwareCamera && !isNativeAppleCameraFilename) {
    const ratio = Math.max(photo.width, photo.height) / Math.min(photo.width, photo.height)
    const isMobilePng = ext === 'png' && (photo.height / photo.width >= 1.6 || photo.width / photo.height >= 1.6)

    if (ratio >= 2.4 && !isMobilePng) {
      score += 30
      matchedSignals.push(`Extreme banner aspect ratio (${ratio.toFixed(1)}:1)`)
      if (!identifiedApp) category = 'browser'
    }

    if (Math.max(photo.width, photo.height) <= 400 && photo.file_size < 150 * 1024) {
      score += 35
      matchedSignals.push(`Small asset dimensions (${photo.width}×${photo.height})`)
      if (!identifiedApp) category = 'browser'
    }

    // 1:1 Square Post
    if (photo.width === photo.height && photo.width >= 450 && photo.width <= 1440) {
      score += 25
      matchedSignals.push(`1:1 Square post format (${photo.width}×${photo.height})`)
      if (!identifiedApp) category = 'other-apps'
    }
  }

  // Check OCR extracted text for meme/quote/social indicators
  if (photo.extracted_text && !hasHardwareCamera && !isNativeAppleCameraFilename) {
    const text = photo.extracted_text.toLowerCase()
    if (text.length > 20 && text.length < 500) {
      if (/funny|joke|quote|good morning|happy|blessed|life|truth|daily|follow|share|subscribe/i.test(text)) {
        score += 30
        matchedSignals.push('Text matches social / meme quote')
        if (!identifiedApp) category = 'other-apps'
      }
    }
  }

  // WebP sticker / graphic
  if (ext === 'webp') {
    if ((photo.width && photo.height && Math.max(photo.width, photo.height) <= 800) || (photo.file_size && photo.file_size < 300 * 1024)) {
      score += 40
      matchedSignals.push('WebP sticker / graphic format')
      if (!identifiedApp) category = 'other-apps'
    }
  }

  // Platform standard dimensions
  if (photo.width && photo.height) {
    const w = photo.width
    const h = photo.height
    for (const [kw, kh] of KNOWN_PLATFORM_DIMS) {
      if ((w === kw && h === kh) || (w === kh && h === kw)) {
        score += 15
        matchedSignals.push(`Platform standard dimension (${w}×${h})`)
        break
      }
    }
  }

  // Heavy messaging re-compression
  if (photo.width && photo.height && photo.file_size && !hasHardwareCamera && !isNativeAppleCameraFilename) {
    const pixels = photo.width * photo.height
    const bytesPerPx = photo.file_size / pixels
    if (bytesPerPx < 0.18 && pixels > 200000) {
      score += 25
      matchedSignals.push(`Heavy messaging re-compression (${bytesPerPx.toFixed(3)} bytes/px)`)
      if (!identifiedApp) category = 'other-apps'
    }
  }

  // ─── 9. Camera Hardware EXIF Safeguard (-60 Penalty) ─────────────────────
  if (hasHardwareCamera || isNativeAppleCameraFilename || isRawFormat) {
    // Large penalty for genuine camera photos so family photos are NEVER misclassified
    score -= 60
    matchedSignals.push(`Original camera hardware EXIF detected (${cameraMake} ${cameraModel})`)
  } else if (!hasHardwareCamera && (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'mov' || ext === 'mp4' || ext === 'webp' || ext === 'm4v')) {
    score += 25
    matchedSignals.push('Stripped camera hardware EXIF (Make/Model missing)')
  }

  // Normalization
  score = Math.max(0, Math.min(100, score))

  let classification: SocialAppOrigin['classification'] = 'keep'
  if (score >= 60) {
    classification = 'app-media'
  } else if (score >= 35) {
    classification = 'uncertain'
  }

  const theme = APP_THEMES[category] || APP_THEMES['other-apps']

  return {
    isAppMedia: classification === 'app-media' || classification === 'uncertain',
    isJunk: classification === 'app-media',
    isUncertain: classification === 'uncertain',
    classification,
    score,
    category,
    label: theme.label,
    color: theme.color,
    gradient: theme.gradient,
    reason: matchedSignals.join(' • ') || 'Standard camera photo',
    matchedSignals
  }
}
