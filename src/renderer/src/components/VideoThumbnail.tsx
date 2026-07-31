import React, { useEffect, useState } from 'react'

interface VideoThumbnailProps {
  src: string
  alt?: string
  className?: string
  style?: React.CSSProperties
  onLoad?: () => void
}

export default function VideoThumbnail({ src, alt, className, style, onLoad }: VideoThumbnailProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const video = document.createElement('video')
    
    // We add #t=0.1 to attempt native seeking immediately, but we'll also programmatically seek
    video.src = src.includes('#t=') ? src : `${src}#t=0.1`
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'

    video.onloadeddata = () => {
      if (!isMounted) return
      // Seek to 1 second in or 10% in, to avoid black frames
      const seekTime = Math.min(1, video.duration * 0.1 || 0.1)
      video.currentTime = seekTime
    }

    video.onseeked = () => {
      if (!isMounted) return
      const canvas = document.createElement('canvas')
      // Cap resolution to avoid massive memory usage for 4K video thumbnails
      const maxDim = 400
      let w = video.videoWidth
      let h = video.videoHeight
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h)
        w *= ratio
        h *= ratio
      }
      canvas.width = Math.max(1, w)
      canvas.height = Math.max(1, h)
      
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
        setThumbnailUrl(dataUrl)
        if (onLoad) onLoad()
      }
      
      // Force cleanup
      video.removeAttribute('src')
      video.load()
    }

    video.onerror = () => {
      if (isMounted && onLoad) onLoad() // prevent infinite loading spinner
      // Force cleanup
      video.removeAttribute('src')
      video.load()
    }

    return () => {
      isMounted = false
      video.removeAttribute('src')
      video.load()
    }
  }, [src])

  if (!thumbnailUrl) {
    return <div className={className} style={{ ...style, background: 'var(--bg-tertiary)' }} />
  }

  return (
    <img 
      src={thumbnailUrl} 
      alt={alt} 
      className={className} 
      style={style}
      loading="lazy"
      draggable={false}
    />
  )
}
