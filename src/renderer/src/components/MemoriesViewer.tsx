import React, { useState, useEffect, useRef } from 'react'
import { X, Heart, Pause, Play, ChevronLeft, ChevronRight } from 'lucide-react'
import { Memory } from './MemoriesCarousel'
import { getBestDisplayUrl, formatDate } from '../utils/helpers'
import { usePhotos } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'

interface MemoriesViewerProps {
  memory: Memory
  onClose: () => void
}

const STORY_DURATION_MS = 5000

export default function MemoriesViewer({ memory, onClose }: MemoriesViewerProps) {
  const [photoIndex, setPhotoIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const { dispatch, refreshPhotos } = usePhotos()
  const { showToast } = useApp()
  const currentPhoto = memory.photos[photoIndex]

  const startTimeRef = useRef<number>(Date.now())
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    if (isPaused) return

    startTimeRef.current = Date.now() - progress * STORY_DURATION_MS

    function updateProgress() {
      const elapsed = Date.now() - startTimeRef.current
      const currentProgress = Math.min(elapsed / STORY_DURATION_MS, 1)
      setProgress(currentProgress)

      if (currentProgress >= 1) {
        if (photoIndex < memory.photos.length - 1) {
          setPhotoIndex(prev => prev + 1)
          setProgress(0)
          startTimeRef.current = Date.now()
        } else {
          onClose()
        }
      } else {
        animationFrameRef.current = requestAnimationFrame(updateProgress)
      }
    }

    animationFrameRef.current = requestAnimationFrame(updateProgress)

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [photoIndex, isPaused, memory.photos.length, onClose])

  function handleNext() {
    if (photoIndex < memory.photos.length - 1) {
      setPhotoIndex(prev => prev + 1)
      setProgress(0)
    } else {
      onClose()
    }
  }

  function handlePrev() {
    if (photoIndex > 0) {
      setPhotoIndex(prev => prev - 1)
      setProgress(0)
    }
  }

  async function handleToggleFavorite(e: React.MouseEvent) {
    e.stopPropagation()
    if (!currentPhoto) return
    const isFav = await window.photoVault.toggleFavorite(currentPhoto.id)
    dispatch({ type: 'UPDATE_PHOTO', payload: { ...currentPhoto, is_favorite: isFav ? 1 : 0 } })
    showToast(isFav ? 'Added to favorites' : 'Removed from favorites')
    refreshPhotos()
  }

  if (!currentPhoto) return null

  const imgSrc = getBestDisplayUrl(currentPhoto)

  return (
    <div className="memories-viewer">
      {/* Top progress bars */}
      <div className="memories-viewer-progress-container">
        {memory.photos.map((_: any, idx: number) => (
          <div key={idx} className="memories-viewer-progress-bar">
            <div
              className="memories-viewer-progress-fill"
              style={{
                width: idx < photoIndex ? '100%' : idx === photoIndex ? `${progress * 100}%` : '0%'
              }}
            />
          </div>
        ))}
      </div>

      {/* Header toolbar */}
      <div className="memories-viewer-header">
        <div className="memories-viewer-info">
          <span className="memories-viewer-title">{memory.title}</span>
          <span className="memories-viewer-date">{formatDate(currentPhoto.created_at)}</span>
        </div>

        <div className="memories-viewer-actions">
          <button className="viewer-btn" onClick={handleToggleFavorite}>
            <Heart size={20} fill={currentPhoto.is_favorite ? 'currentColor' : 'none'} color={currentPhoto.is_favorite ? 'var(--favorite)' : 'white'} />
          </button>
          <button className="viewer-btn" onClick={() => setIsPaused(prev => !prev)}>
            {isPaused ? <Play size={20} /> : <Pause size={20} />}
          </button>
          <button className="viewer-btn" onClick={onClose}>
            <X size={22} />
          </button>
        </div>
      </div>

      {/* Story media display */}
      <div
        className="memories-viewer-body"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        <button className="memories-nav-btn prev" onClick={handlePrev}>
          <ChevronLeft size={32} />
        </button>

        <img src={imgSrc} alt={currentPhoto.filename} className="memories-viewer-image" />

        <button className="memories-nav-btn next" onClick={handleNext}>
          <ChevronRight size={32} />
        </button>
      </div>
    </div>
  )
}
