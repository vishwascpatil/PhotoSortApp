export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const dayMs = 86400000

  if (diff < dayMs && date.getDate() === now.getDate()) {
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
    weekday: diff < 7 * dayMs ? 'long' : undefined,
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }

  return date.toLocaleDateString('en-US', options)
}

export function formatDateFull(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function groupPhotosByDate(photos: { id: number; created_at: string }[]): Map<string, number[]> {
  const groups = new Map<string, number[]>()
  for (const photo of photos) {
    const dateKey = photo.created_at.split('T')[0] || photo.created_at.split(' ')[0]
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
  return `file://${filePath.replace(/\\/g, '/')}`
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
