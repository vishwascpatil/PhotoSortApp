import React, { useState, useEffect, useRef } from 'react'
import { X, Play, Pause, SkipForward, SkipBack, Settings } from 'lucide-react'
import { Photo, usePhotos } from '../contexts/PhotoContext'
import { getBestDisplayUrl, formatDate } from '../utils/helpers'

interface SlideshowViewerProps {
  photos: Photo[]
  initialPhotoId?: number
  onClose: () => void
}

export default function SlideshowViewer({ photos, initialPhotoId, onClose }: SlideshowViewerProps) {
  const initialIndex = initialPhotoId
    ? photos.findIndex(p => p.id === initialPhotoId)
    : 0

  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [intervalSec, setIntervalSec] = useState(4)
  const [showControls, setShowControls] = useState(true)

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const photo = photos[currentIndex]

  // Auto-advance photos
  useEffect(() => {
    if (!isPlaying) return
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % photos.length)
    }, intervalSec * 1000)
    return () => clearInterval(timer)
  }, [isPlaying, intervalSec, photos.length])

  // Mouse activity timer for hiding controls
  useEffect(() => {
    function handleMouseMove() {
      setShowControls(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => {
        if (isPlaying) setShowControls(false)
      }, 3000)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [isPlaying])

  // Keyboard controls
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === ' ') {
        e.preventDefault()
        setIsPlaying(prev => !prev)
      }
      if (e.key === 'ArrowRight') setCurrentIndex(prev => (prev + 1) % photos.length)
      if (e.key === 'ArrowLeft') setCurrentIndex(prev => (prev - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [photos.length, onClose])

  if (!photo) return null

  const imgSrc = getBestDisplayUrl(photo)

  return (
    <div className="slideshow-viewer">
      {/* Background Ambient Blur */}
      <img src={imgSrc} alt="" className="slideshow-bg-blur" />

      {/* Main Slide Image */}
      <div className="slideshow-image-container">
        <img key={photo.id} src={imgSrc} alt={photo.filename} className="slideshow-image fade-in" />
      </div>

      {/* Overlay Toolbar & Controls */}
      <div className={`slideshow-controls ${showControls ? 'visible' : 'hidden'}`}>
        <div className="slideshow-info">
          <span className="slideshow-filename">{photo.filename}</span>
          <span className="slideshow-date">{formatDate(photo.created_at)}</span>
        </div>

        <div className="slideshow-actions">
          <button className="viewer-btn" onClick={() => setCurrentIndex(prev => (prev - 1 + photos.length) % photos.length)}>
            <SkipBack size={20} />
          </button>
          <button className="viewer-btn primary" onClick={() => setIsPlaying(prev => !prev)}>
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button className="viewer-btn" onClick={() => setCurrentIndex(prev => (prev + 1) % photos.length)}>
            <SkipForward size={20} />
          </button>

          <select
            className="slideshow-speed-select"
            value={intervalSec}
            onChange={(e) => setIntervalSec(Number(e.target.value))}
          >
            <option value={2}>2s</option>
            <option value={4}>4s</option>
            <option value={6}>6s</option>
            <option value={10}>10s</option>
          </select>

          <button className="viewer-btn" onClick={onClose} title="Exit Slideshow">
            <X size={22} />
          </button>
        </div>
      </div>
    </div>
  )
}
