import { extname } from 'path'

// 1. Free Tier Photos (20 formats)
export const FREE_PHOTO_EXTENSIONS = new Set([
  // JPEG
  '.jpg', '.jpeg', '.jfif',
  // PNG
  '.png',
  // Apple
  '.heic', '.heif',
  // TIFF
  '.tiff', '.tif',
  // Modern web formats
  '.webp', '.avif',
  // JPEG XL
  '.jxl',
  // Classic
  '.bmp', '.gif',
  // JPEG 2000
  '.jp2', '.j2k', '.jpf', '.jpx',
  // JPEG XR / HD Photo
  '.jxr', '.wdp', '.hdp'
])

// 2. Free Tier Videos (26 formats)
export const FREE_VIDEO_EXTENSIONS = new Set([
  // Apple / Common
  '.mov', '.mp4', '.m4v',
  // Windows
  '.avi', '.wmv', '.asf',
  // Containers
  '.mkv', '.webm',
  // Mobile
  '.3gp', '.3g2',
  // Older / broadcast
  '.dv', '.vob', '.mpg', '.mpeg', '.mp2',
  // Flash / legacy web
  '.f4v', '.flv',
  // Open source
  '.ogv', '.ogg',
  // Transport stream
  '.m2t', '.mts', '.m2ts',
  // RealMedia legacy
  '.rm', '.rmvb',
  // DivX / XviD legacy
  '.divx', '.xvid'
])

// 3. Pro Camera RAW Photos (32 formats)
export const RAW_PHOTO_EXTENSIONS = new Set([
  // Canon
  '.cr2', '.cr3', '.crw',
  // Nikon
  '.nef', '.nrw',
  // Sony
  '.arw', '.sr2', '.srf',
  // Adobe / Generic
  '.dng',
  // Olympus / OM System
  '.orf',
  // Fujifilm
  '.raf',
  // Panasonic / Lumix
  '.rw2',
  // Pentax / Ricoh
  '.pef', '.ptx',
  // Samsung
  '.srw',
  // Sigma
  '.x3f',
  // Leica
  '.rwl', '.raw',
  // Minolta / Konica
  '.mrw',
  // Hasselblad
  '.3fr', '.fff',
  // Phase One / Capture One
  '.iiq', '.cap',
  // Kodak
  '.kdc', '.dcr', '.k25',
  // Epson
  '.erf',
  // GoPro / Generic RAW
  '.gpr',
  // Mamiya
  '.mef',
  // Casio
  '.bay',
  // Sinar
  '.sti',
  // Leaf / Creo
  '.mos'
])

// 4. Pro Cinema RAW & Pro Video (13 formats)
export const CINEMA_PRO_VIDEO_EXTENSIONS = new Set([
  // Blackmagic RAW
  '.braw',
  // RED RAW
  '.r3d',
  // ARRI
  '.ari', '.arx',
  // Canon Cinema RAW Light
  '.crm',
  // Sony RAW / Venice
  '.mxf',
  // Phantom / Vision Research high-speed
  '.cine',
  // Insta360 cameras
  '.insv',
  // GoPro low-res proxy
  '.lrv',
  // Panasonic P2
  '.op1', '.op2',
  // DNxHD / Avid
  '.dnxhd',
  // Final Cut Pro
  '.fcpvid'
])

// Additional formats supported by PhotoSort
export const GRAPHIC_EXTENSIONS = new Set([
  '.svg'
])

export const DOC_EXTENSIONS = new Set([
  '.pdf', '.txt', '.doc', '.docx'
])

// Combined category sets
export const ALL_IMAGE_EXTENSIONS = new Set<string>([
  ...FREE_PHOTO_EXTENSIONS,
  ...RAW_PHOTO_EXTENSIONS,
  ...GRAPHIC_EXTENSIONS
])

export const ALL_VIDEO_EXTENSIONS = new Set<string>([
  ...FREE_VIDEO_EXTENSIONS,
  ...CINEMA_PRO_VIDEO_EXTENSIONS
])

export const ALL_SUPPORTED_EXTENSIONS = new Set<string>([
  ...ALL_IMAGE_EXTENSIONS,
  ...ALL_VIDEO_EXTENSIONS,
  ...DOC_EXTENSIONS
])

// Comprehensive MIME type mapping for all 96 extensions
export const MIME_TYPES: Record<string, string> = {
  // Photos
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jxl': 'image/jxl',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jp2': 'image/jp2',
  '.j2k': 'image/jp2',
  '.jpf': 'image/jp2',
  '.jpx': 'image/jp2',
  '.jxr': 'image/jxr',
  '.wdp': 'image/vnd.ms-photo',
  '.hdp': 'image/vnd.ms-photo',
  '.svg': 'image/svg+xml',

  // RAW Photos
  '.dng': 'image/x-adobe-dng',
  '.cr2': 'image/x-canon-cr2',
  '.cr3': 'image/x-canon-cr3',
  '.crw': 'image/x-canon-crw',
  '.nef': 'image/x-nikon-nef',
  '.nrw': 'image/x-nikon-nrw',
  '.arw': 'image/x-sony-arw',
  '.sr2': 'image/x-sony-sr2',
  '.srf': 'image/x-sony-srf',
  '.orf': 'image/x-olympus-orf',
  '.raf': 'image/x-fuji-raf',
  '.rw2': 'image/x-panasonic-rw2',
  '.pef': 'image/x-pentax-pef',
  '.ptx': 'image/x-pentax-ptx',
  '.srw': 'image/x-samsung-srw',
  '.x3f': 'image/x-sigma-x3f',
  '.rwl': 'image/x-leica-rwl',
  '.raw': 'image/x-panasonic-raw',
  '.mrw': 'image/x-minolta-mrw',
  '.3fr': 'image/x-hasselblad-3fr',
  '.fff': 'image/x-hasselblad-fff',
  '.iiq': 'image/x-phaseone-iiq',
  '.cap': 'image/x-phaseone-cap',
  '.kdc': 'image/x-kodak-kdc',
  '.dcr': 'image/x-kodak-dcr',
  '.k25': 'image/x-kodak-k25',
  '.erf': 'image/x-epson-erf',
  '.gpr': 'image/x-gopro-gpr',
  '.mef': 'image/x-mamiya-mef',
  '.bay': 'image/x-casio-bay',
  '.sti': 'image/x-sinar-sti',
  '.mos': 'image/x-leaf-mos',

  // Videos
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.asf': 'video/x-ms-asf',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.3gp': 'video/3gpp',
  '.3g2': 'video/3gpp2',
  '.dv': 'video/x-dv',
  '.vob': 'video/x-ms-vob',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.mp2': 'video/mpeg',
  '.f4v': 'video/x-f4v',
  '.flv': 'video/x-flv',
  '.ogv': 'video/ogg',
  '.ogg': 'video/ogg',
  '.m2t': 'video/mp2t',
  '.mts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.rm': 'video/vnd.rn-realvideo',
  '.rmvb': 'video/vnd.rn-realvideo',
  '.divx': 'video/divx',
  '.xvid': 'video/x-xvid',

  // Cinema RAW & Pro Video
  '.braw': 'video/x-braw',
  '.r3d': 'video/x-r3d',
  '.ari': 'video/x-arri-ari',
  '.arx': 'video/x-arri-arx',
  '.crm': 'video/x-canon-crm',
  '.mxf': 'application/mxf',
  '.cine': 'video/x-phantom-cine',
  '.insv': 'video/mp4',
  '.lrv': 'video/mp4',
  '.op1': 'application/mxf',
  '.op2': 'application/mxf',
  '.dnxhd': 'video/x-dnxhd',
  '.fcpvid': 'video/quicktime',

  // Documents
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

export function normalizeExt(filePathOrExt: string): string {
  if (!filePathOrExt) return ''
  const trimmed = filePathOrExt.trim().toLowerCase()
  if (trimmed.startsWith('.')) return trimmed
  const ext = extname(trimmed).toLowerCase()
  return ext || `.${trimmed}`
}

export function isSupportedMedia(filePathOrExt: string): boolean {
  const ext = normalizeExt(filePathOrExt)
  return ALL_SUPPORTED_EXTENSIONS.has(ext)
}

export function isVideoFile(filePathOrExt: string): boolean {
  if (!filePathOrExt) return false
  const lower = filePathOrExt.toLowerCase()
  if (lower.startsWith('video/')) return true
  const ext = normalizeExt(lower)
  return ALL_VIDEO_EXTENSIONS.has(ext)
}

export function isImageFile(filePathOrExt: string): boolean {
  if (!filePathOrExt) return false
  const lower = filePathOrExt.toLowerCase()
  if (lower.startsWith('image/')) return true
  const ext = normalizeExt(lower)
  return ALL_IMAGE_EXTENSIONS.has(ext)
}

export function isRawPhotoFile(filePathOrExt: string): boolean {
  const ext = normalizeExt(filePathOrExt)
  return RAW_PHOTO_EXTENSIONS.has(ext)
}

export function isCinemaRawFile(filePathOrExt: string): boolean {
  const ext = normalizeExt(filePathOrExt)
  return CINEMA_PRO_VIDEO_EXTENSIONS.has(ext)
}

export function isDocFile(filePathOrExt: string): boolean {
  const ext = normalizeExt(filePathOrExt)
  return DOC_EXTENSIONS.has(ext)
}

export function getMimeType(filePathOrExt: string): string {
  const ext = normalizeExt(filePathOrExt)
  if (MIME_TYPES[ext]) return MIME_TYPES[ext]
  if (ALL_VIDEO_EXTENSIONS.has(ext)) return 'video/mp4'
  if (DOC_EXTENSIONS.has(ext)) return 'application/octet-stream'
  return 'image/jpeg'
}
