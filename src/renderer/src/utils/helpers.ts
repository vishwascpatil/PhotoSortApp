export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'No Date'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 'No Date'
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const dayMs = 86400000

  if (diff >= 0 && diff < dayMs && date.getDate() === now.getDate()) {
    return 'Today'
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear()) {
    return 'Yesterday'
  }

  const options: Intl.DateTimeFormatOptions = {
    weekday: diff < 7 * dayMs && diff >= 0 ? 'long' : undefined,
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }

  return date.toLocaleDateString('en-US', options)
}

export function formatDateFull(dateStr: string | null | undefined): string {
  if (!dateStr) return 'No Date'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 'No Date'
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function groupPhotosByDate(photos: { id: number; created_at?: string }[]): Map<string, number[]> {
  const groups = new Map<string, number[]>()
  for (const photo of photos) {
    const raw = photo.created_at || ''
    const dateKey = raw ? (raw.split('T')[0] || raw.split(' ')[0]) : 'Unknown Date'
    const existing = groups.get(dateKey) || []
    existing.push(photo.id)
    groups.set(dateKey, existing)
  }
  return groups
}

export function getThumbnailUrl(path: string | null, fallbackFilePath?: string): string {
  const targetPath = path || fallbackFilePath
  if (!targetPath) return ''
  if (targetPath.startsWith('http://') || targetPath.startsWith('https://') || targetPath.startsWith('file://')) {
    return targetPath
  }
  const normalized = targetPath.replace(/\\/g, '/')
  return `file:///${normalized}`
}

export function getOriginalUrl(filePath: string): string {
  if (!filePath) return ''
  if (filePath.startsWith('file://')) return filePath
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  const encodedParts = parts.map((part, index) => {
    if (index === 0 && part.endsWith(':')) return part
    return encodeURIComponent(part)
  })
  const encodedPath = encodedParts.join('/')
  return encodedPath.startsWith('/') ? `file://${encodedPath}` : `file:///${encodedPath}`
}

export function getVideoUrl(filePath: string): string {
  return getOriginalUrl(filePath)
}

export function isVideoFile(filePath: string): boolean {
  if (!filePath) return false
  const lastDot = filePath.lastIndexOf('.')
  if (lastDot === -1) return false
  const ext = filePath.slice(lastDot).toLowerCase()
  const videoExts = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.m4v', '.3gp', '.flv'])
  return videoExts.has(ext)
}

export function isBrowserNativeImage(filePath: string): boolean {
  if (!filePath) return true
  const lastDot = filePath.lastIndexOf('.')
  if (lastDot === -1) return true
  const ext = filePath.slice(lastDot).toLowerCase()
  const nativeExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.svg'])
  return nativeExts.has(ext)
}

export function getBestDisplayUrl(photo: any): string {
  if (!photo) return ''
  const isVideo = photo.mime_type?.startsWith('video')
  if (isVideo) {
    if (photo.preview_path) return getOriginalUrl(photo.preview_path)
    if (photo.thumbnail_path) return getOriginalUrl(photo.thumbnail_path)
  }
  return getOriginalUrl(photo.file_path)
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: unknown[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }) as T
}
