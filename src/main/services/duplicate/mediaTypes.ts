import {
  ALL_VIDEO_EXTENSIONS,
  ALL_IMAGE_EXTENSIONS,
  isVideoFile as isVideoFileRegistry,
  isImageFile as isImageFileRegistry
} from '../../mediaRegistry'

export const VIDEO_EXTENSIONS = ALL_VIDEO_EXTENSIONS
export const IMAGE_EXTENSIONS = ALL_IMAGE_EXTENSIONS

export function isVideoFile(filePathOrMime: string): boolean {
  return isVideoFileRegistry(filePathOrMime)
}

export function isImageFile(filePathOrMime: string): boolean {
  return isImageFileRegistry(filePathOrMime)
}
