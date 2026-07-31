import { getThumbnailUrl } from './helpers'

export function isVideoPath(path: string | null | undefined): boolean {
  if (!path) return false
  const lower = path.toLowerCase()
  return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.avi') || lower.endsWith('.mkv') || lower.endsWith('.webm')
}
