export const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.m4v', '.3gp',
  '.flv', '.mts', '.m2ts', '.ts', '.vob', '.ogv', '.divx'
])

export const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif',
  '.avif', '.svg', '.heic', '.heif',
  '.dng', '.cr2', '.nef', '.arw', '.raw', '.orf', '.rw2', '.pef', '.raf'
])

export function isVideoFile(filePathOrMime: string): boolean {
  if (!filePathOrMime) return false
  const lower = filePathOrMime.toLowerCase()
  if (lower.startsWith('video/')) return true
  const extIndex = lower.lastIndexOf('.')
  if (extIndex !== -1) {
    const ext = lower.substring(extIndex)
    if (VIDEO_EXTENSIONS.has(ext)) return true
  }
  return false
}

export function isImageFile(filePathOrMime: string): boolean {
  if (!filePathOrMime) return false
  const lower = filePathOrMime.toLowerCase()
  if (lower.startsWith('image/')) return true
  const extIndex = lower.lastIndexOf('.')
  if (extIndex !== -1) {
    const ext = lower.substring(extIndex)
    if (IMAGE_EXTENSIONS.has(ext)) return true
  }
  return false
}
